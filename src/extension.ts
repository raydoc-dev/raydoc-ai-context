import * as vscode from 'vscode';
import { gatherErrorContext } from './gatherError';
import { contextToString } from './toString';

export function activate(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('raydoc-context');
    const includeComments = config.get('includeComments') as boolean;
    const depth = config.get('depth') as number;


    // 1) Register a Code Action Provider for errors:
    const codeActionProvider = new ErrorContextCodeActionProvider();
    const providerDisposable = vscode.languages.registerCodeActionsProvider(
        // Register for all languages; you can narrow to { language: 'typescript' }, etc.
        { scheme: 'file', language: '*' },
        codeActionProvider,
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    );

    // 2) Register the "copy context" command invoked by the Code Action
    const copyContextCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContext',
        async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
            // Gather all context data (environment, function text, file tree, etc.)
            const context = await gatherErrorContext(uri, diagnostic);
            if (!context) {
                vscode.window.showWarningMessage('No context available to copy.');
                return;
            }
            const output = contextToString(context);
            if (output) {
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage('Error context copied to clipboard!');
            } else {
                vscode.window.showWarningMessage('No context available to copy.');
            }
        }
    );

    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => {
            // Attempt to detect an error at the current cursor position
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active text editor.');
                return;
            }

            const position = editor.selection.active; // Cursor position
            const docUri = editor.document.uri;

            // Get all diagnostics for this file
            const diagnostics = vscode.languages.getDiagnostics(docUri);

            // Find a diagnostic that covers the cursor position
            const diag = diagnostics.find(d => d.range.contains(position));
            if (!diag) {
                vscode.window.showWarningMessage('No error at the current cursor position.');
                return;
            }

            // We found an error at the cursor position; gather context
            const context = await gatherErrorContext(docUri, diag);
            if (!context) {
                vscode.window.showWarningMessage('No context available to copy.');
                return;
            }
            const output = contextToString(context);
            if (output) {
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage('Error context copied to clipboard!');
            } else {
                vscode.window.showWarningMessage('No context available to copy.');
            }
        }
    );

    context.subscriptions.push(providerDisposable, copyContextCommand, copyContextAtCursorCommand);
}

export function deactivate() {
    // Cleanup if needed
}

/**
 * A Code Action Provider that offers a "Copy context" quick fix for each error diagnostic.
 */
class ErrorContextCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            if (diag.severity === vscode.DiagnosticSeverity.Error) {
                // Create a CodeAction for "Copy context"
                const action = new vscode.CodeAction('Copy context', vscode.CodeActionKind.QuickFix);
                // This quick fix invokes our command with the document URI and this diagnostic
                action.command = {
                    command: 'raydoc-context.copyContext',
                    title: 'Copy context',
                    arguments: [document.uri, diag],
                };
                // Associate it with the diagnostic so it shows on the lightbulb for this error
                action.diagnostics = [diag];

                actions.push(action);
            }
        }
        return actions;
    }
}
