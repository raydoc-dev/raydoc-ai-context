import * as vscode from 'vscode';
import { consolidateContexts, gatherContext } from './context';
import { RaydocContext } from './types';
import { getAllFunctionDefinitionsInDoc } from './functions';
import { codebaseSummaryPrompt, ModelType } from './llm/llm';
import { contextToString, contextToStringLlm } from './toString';
import { getFunctionDefinition } from './functions';
import { FunctionDefinition } from './types';
import { FireworksClient } from './llm/fireworks';
import { getSecret } from './secrets';

export function activate(context: vscode.ExtensionContext) {
    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => { copyContextAtCursorCommandHandler(); }
    );

    const generateProjectDocumentationCommand = vscode.commands.registerCommand(
        'raydoc-context.generateProjectDocumentation',
        async () => { generateProjectDocumentationCommandHandler(); }
    );

    const sendContextToLlmCommand = vscode.commands.registerCommand(
        'raydoc-context.sendContextToLlm',
        async () => { sendContextToLlmCommandHandler(); }
    );

    const secretsConfigChanged = vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('raydoc-context.secrets')) {
            console.log('Secrets configuration changed.');
            const openaiApiKey = await getSecret(context, 'openaiApiKey');
            if (openaiApiKey) {
                vscode.window.showInformationMessage('Raydoc: OpenAI API key retrieved.');
                process.env.OPENAI_API_KEY = openaiApiKey;
            }
            const raydocApiKey = await getSecret(context, 'raydocApiKey');
            if (raydocApiKey) {
                vscode.window.showInformationMessage('Raydoc: Raydoc API key retrieved.');
                process.env.RAYDOC_API_KEY = raydocApiKey;
            }
            const fireworksApiKey = await getSecret(context, 'fireworksApiKey');
            if (fireworksApiKey) {
                vscode.window.showInformationMessage('Raydoc: Fireworks API key retrieved.');
                process.env.FIREWORKS_API_KEY = fireworksApiKey;
            }
            process.env.OPENAI_API_KEY = await getSecret(context, 'openaiApiKey');
            process.env.RAYDOC_API_KEY = await getSecret(context, 'raydocApiKey');
        }

    });

    context.subscriptions.push(
        copyContextAtCursorCommand,
        generateProjectDocumentationCommand,
        sendContextToLlmCommand,
        secretsConfigChanged
    );
}

export function deactivate() {
    // Cleanup if needed
}

async function copyContextAtCursorCommandHandler() {
    // Attempt to detect an error at the current cursor position
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor.');
        return;
    }

    const position = editor.selection.active; // Cursor position
    const doc = editor.document;
    const docUri = doc.uri;

    // Get all diagnostics for this file
    const diagnostics = vscode.languages.getDiagnostics(docUri);

    // Find a diagnostic that covers the cursor position
    const diag = diagnostics.find(d => d.range.contains(position));

    const context = await gatherContext(doc, position, diag);

    if (!context) {
        vscode.window.showErrorMessage('No context found for the current cursor position.');
        return;
    }

    const output = contextToString(context);
    if (output) {
        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage('Raydoc: context copied to clipboard!');
    } else {
        vscode.window.showWarningMessage('No context available to copy.');
    }
}

export async function generateProjectDocumentationCommandHandler() {
    vscode.window.showInformationMessage('Generating codebase summary...');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder found.');
        return;
    }

    // Exclude common folders that are intentionally ignored (like node_modules and .git)
    const excludePaths = vscode.workspace.getConfiguration('raydoc-context').get<string[]>('ignoreTypePaths') || [];
    const excludePattern = `{${excludePaths.map(path => `**/${path}/*`).join(',')}}`;
    const files = await vscode.workspace.findFiles('**/*', excludePattern);

    const contexts: RaydocContext[] = [];

    for (const fileUri of files) {
        console.log(`Processing file: ${fileUri.fsPath}`);
        try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const functionsInDoc = await getAllFunctionDefinitionsInDoc(doc);
            for (const fn of functionsInDoc) {
                const context = await gatherContext(doc, fn.functionSymbol.range.start, undefined);
                if (context) {
                    contexts.push(context);
                }
            }
        } catch (error) {
            console.error(`Failed to process file ${fileUri.fsPath}: ${error}`);
        }
    }

    if (contexts.length === 0) {
        vscode.window.showErrorMessage('No context found in workspace.');
        console.log('contexts failed to be gathered.');
        return;
    }

    const dedupedContext = consolidateContexts(contexts);

    const summaryPrompt = codebaseSummaryPrompt(dedupedContext);

    try {
        const llmClient = new FireworksClient();

        const codebaseSummary = await llmClient.query(summaryPrompt, ModelType.LargeLlm);

        if (codebaseSummary) {
            await vscode.env.clipboard.writeText(codebaseSummary);
            vscode.window.showInformationMessage('Raydoc: codebase summary copied to clipboard!');
        } else {
            vscode.window.showWarningMessage('No codebase summary available.');
        }
    } catch (error) {
        console.error(`Failed to generate codebase summary: ${error}`);
        vscode.window.showErrorMessage(`Failed to generate codebase summary. ${error}`);
    }
}

async function sendContextToLlmCommandHandler() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor.');
        return;
    }

    const position = editor.selection.active; // Store cursor position
    const doc = editor.document;
    const functionDefinition = await getFunctionDefinition(doc, position);

    if (!functionDefinition) {
        vscode.window.showErrorMessage('No function definition found for the current cursor position.');
        return;
    }

    const context = await gatherContext(doc, position, undefined);

    if (!context) {
        vscode.window.showErrorMessage('No context found for the current cursor position.');
        return;
    }

    // Store the current file's URI to return to it later
    const originalFileUri = doc.uri;

    // Process all function references
    await selectAndSendToLlm(functionDefinition);

    for (const typeDefn of context.typeDefns || []) {
        await selectAndSendToLlm(typeDefn);
    }

    for (const referencedFunction of context.referencedFunctions || []) {
        await selectAndSendToLlm(referencedFunction);
    }

    // Switch back to the original file and restore cursor position
    const originalDoc = await vscode.workspace.openTextDocument(originalFileUri);
    const originalEditor = await vscode.window.showTextDocument(originalDoc, vscode.ViewColumn.One);


    originalEditor.selection = new vscode.Selection(position, position);

    const output = contextToStringLlm(context);
    await vscode.env.clipboard.writeText(output);

    vscode.window.showInformationMessage('Raydoc: context copied to clipboard and sent to LLM!');
}

async function selectAndSendToLlm(functionDefinition: FunctionDefinition) {
    const config = vscode.workspace.getConfiguration('raydoc-context');
    const useCursor = config.get('use-cursor');

    // Get the file URI from the function definition (relative to the workspace root)
    const fullFilePath = vscode.workspace.workspaceFolders
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, functionDefinition.filename).fsPath
        : functionDefinition.filename; // Fallback if workspace is not open

    const fileUri = vscode.Uri.file(fullFilePath);

    // Open the document
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

    // Get function range (you should implement this based on your logic)
    let functionRange = getSelectionFromFunctionDefinition(doc, functionDefinition);

    // Apply the selection
    editor.selection = functionRange;

    // Attach the selection to the LLM
    if (!useCursor) {
        vscode.commands.executeCommand("github.copilot.chat.attachSelection");
    } else {
        vscode.commands.executeCommand("aichat.insertselectionintochat");
    }
}

function getSelectionFromFunctionDefinition(doc: vscode.TextDocument, functionDefinition: FunctionDefinition): vscode.Selection {
    return new vscode.Selection(
        new vscode.Position(functionDefinition.startLine, 0),
        new vscode.Position(functionDefinition.endLine, doc.lineAt(functionDefinition.endLine).text.length)
    );
}
