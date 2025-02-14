import * as vscode from 'vscode';
import { contextToString } from './toString';
import { consolidateContexts, gatherContext } from './context';
import { RaydocContext } from './types';
import { getAllFunctionDefinitionsInDoc } from './functions';
import { codebaseSummaryPrompt } from './llm/llm';

export function activate(context: vscode.ExtensionContext) {
    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => { copyContextAtCursorCommandHandler(); }
    );

    const generateProjectDocumentationCommand = vscode.commands.registerCommand(
        'raydoc-context.generateProjectDocumentation',
        async () => { generateProjectDocumentationCommandHandler(); }
    );

    context.subscriptions.push(
        copyContextAtCursorCommand,
        generateProjectDocumentationCommand,
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

    console.log(summaryPrompt);

    // const output = contextToString(dedupedContext);
    if (summaryPrompt) {
        // await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage('Raydoc: !!!!');
    } else {
        vscode.window.showWarningMessage('No context available to copy.');
    }
}
