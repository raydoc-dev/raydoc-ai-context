import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';
import { contextToString, contextToStringLlm } from './toString';
import { gatherContext } from './context';
import { getFunctionDefinition } from './functions';
import { FunctionDefinition } from './types';
import { v4 as uuidv4 } from 'uuid';

let analyticsClient: PostHog;
let userId: string | undefined;

class RaydocCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        // Only provide code actions if there are diagnostics (errors/warnings)
        if (!context.diagnostics.length) {
            return;
        }

        const copyAction = new vscode.CodeAction(
            'Copy AI Context at Cursor',
            vscode.CodeActionKind.QuickFix
        );
        copyAction.command = {
            command: 'raydoc-context.copyContextAtCursor',
            title: 'Copy AI Context at Cursor'
        };

        const sendAction = new vscode.CodeAction(
            'Send Context to LLM',
            vscode.CodeActionKind.QuickFix
        );
        sendAction.command = {
            command: 'raydoc-context.sendContextToLlm',
            title: 'Send Context to Cursor Composer or Copilot Chat'
        };

        return [copyAction, sendAction];
    }
}

class RaydocHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        // Get diagnostics at the cursor position
        const diagnostics = vscode.languages.getDiagnostics(document.uri)
        .filter(diag => diag.range.contains(position));
        
        if (!diagnostics.length) {
            return undefined; // No error at cursor position
        }
        
        // Prepare the hover message
        const markdownString = new vscode.MarkdownString();
        
        // Add the original diagnostic message
        markdownString.appendMarkdown(`**Error:** ${diagnostics[0].message}\n\n`);
        
        // Add buttons for our extension's commands
        markdownString.appendMarkdown(`[Copy AI Context for Error](command:raydoc-context.copyContextAtCursor)\n\n[Send Error Context to Cursor Composer/GitHub Copilot](command:raydoc-context.sendContextToLlm)\n\n`);
        
        // Enable command execution from the markdown
        markdownString.isTrusted = true;
        
        return new vscode.Hover(markdownString, diagnostics[0].range);
    }
}

export function activate(context: vscode.ExtensionContext) {
    analyticsClient = new PostHog(
        'phc_Rv9pNJA7chv1QR27K0jg2s1Bwah2PDsZroMEI1Usic7',
        { host: 'https://us.i.posthog.com' }
    );

    const USER_ID_KEY = 'RaydocUserId';

    // Retrieve the stored UUID
    userId = context.globalState.get<string>(USER_ID_KEY);

    // If UUID doesn't exist, generate and store it
    if (!userId) {
        userId = uuidv4();
        context.globalState.update(USER_ID_KEY, userId);

        // This is the first time the extension is being used, we can also check to see if we are using Cursor
        // Automatically detect if we're running in Cursor
        const isCursorDetected = isCursor();
        
        // Get the configuration and update it based on detection
        const config = vscode.workspace.getConfiguration('raydoc-context');
        
        // Only update the configuration if it doesn't match what we detected
        if (config.get<boolean>('use-cursor', false) !== isCursorDetected) {
            // Update the configuration to match the detected editor
            (async () => {
                try {
                    await config.update('use-cursor', isCursorDetected, vscode.ConfigurationTarget.Global);
                    console.log(`Automatically set use-cursor to ${isCursorDetected} based on detection`);
                } catch (err: unknown) {
                    console.error('Failed to update use-cursor setting:', err);
                }
            })();
        }
    }

    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => { copyContextAtCursorCommandHandler(); }
    );

    const sendContextToLlmCommand = vscode.commands.registerCommand(
        'raydoc-context.sendContextToLlm',
        async () => { sendContextToLlmCommandHandler(); }
    );

    // Register the code action provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        { scheme: 'file', pattern: '**/*' }, // Match all files
        new RaydocCodeActionProvider(),
        {
            providedCodeActionKinds: RaydocCodeActionProvider.providedCodeActionKinds
        }
    );

    // Register the hover provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        { scheme: 'file', pattern: '**/*' }, // Match all files
        new RaydocHoverProvider()
    );

    context.subscriptions.push(
        copyContextAtCursorCommand,
        sendContextToLlmCommand,
        codeActionProvider,
        hoverProvider
    );
}

export function deactivate() {
    analyticsClient.shutdown();
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
        userId && analyticsClient.capture({ distinctId: userId, event: `no-context-found-at-cursor-${doc.languageId}` });
        return;
    }

    const output = contextToString(context) + '---\n\n\n';
    if (output) {
        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage('Raydoc: context copied to clipboard!');
        userId && analyticsClient.capture({ distinctId: userId, event: `context-copied-${doc.languageId}` });
    } else {
        vscode.window.showWarningMessage('No context available to copy.');
        userId && analyticsClient.capture({ distinctId: userId, event: `no-context-available-${doc.languageId}` });
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
    const functionDefinition = await getFunctionDefinition(doc, position, false, true);

    if (!functionDefinition) {
        vscode.window.showErrorMessage('No function definition found for the current cursor position.');
        userId && analyticsClient.capture({ distinctId: userId, event: `no-function-found-${doc.languageId}` });
        return;
    }

    const context = await gatherContext(doc, position, undefined);

    if (!context) {
        vscode.window.showErrorMessage('No context found for the current cursor position.');
        userId && analyticsClient.capture({ distinctId: userId, event: `no-context-found-at-cursor-${doc.languageId}` });
        return;
    }

    // Store the current file's URI to return to it later
    const originalFileUri = doc.uri;

    // Get the configuration for the extension
    const config = vscode.workspace.getConfiguration('raydoc-context');
    const useCursor = config.get<boolean>('use-cursor', false);

    // Process all function references
    await selectAndSendToLlm(functionDefinition, useCursor);

    for (const typeDefn of context.typeDefns || []) {
        await selectAndSendToLlm(typeDefn, useCursor);
    }

    for (const referencedFunction of context.referencedFunctions || []) {
        await selectAndSendToLlm(referencedFunction, useCursor);
    }

    if (useCursor) {
        vscode.commands.executeCommand("workbench.panel.composerViewPane2.view.focus");
    }

    // Switch back to the original file and restore cursor position
    const originalDoc = await vscode.workspace.openTextDocument(originalFileUri);
    const originalEditor = await vscode.window.showTextDocument(originalDoc, vscode.ViewColumn.One);


    originalEditor.selection = new vscode.Selection(position, position);

    const output = contextToStringLlm(context);
    await vscode.env.clipboard.writeText(output);

    vscode.window.showInformationMessage('Raydoc: context copied to clipboard and sent to LLM!');

    userId && analyticsClient.capture({ distinctId: userId, event: `context-sent-to-llm-${doc.languageId}` });
}

async function selectAndSendToLlm(functionDefinition: FunctionDefinition, useCursor: boolean) {
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
        await vscode.commands.executeCommand("github.copilot.chat.attachSelection");
    } else {
        await vscode.commands.executeCommand("composer.startComposerPrompt");
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait because cursor was sometimes not adding everything
    }
}

function getSelectionFromFunctionDefinition(doc: vscode.TextDocument, functionDefinition: FunctionDefinition): vscode.Selection {
    return new vscode.Selection(
        new vscode.Position(functionDefinition.startLine, 0),
        new vscode.Position(functionDefinition.endLine, doc.lineAt(functionDefinition.endLine).text.length)
    );
}

function isCursor(): boolean {
    // Check the application name
    const appName = vscode.env.appName;
    
    // Cursor will have "Cursor" in its application name
    return appName.includes('Cursor');
  }
