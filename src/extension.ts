import * as vscode from 'vscode';
import { contextToString } from './toString';
import { gatherContext } from './context';

export function activate(context: vscode.ExtensionContext) {
    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => { copyContextAtCursorCommandHandler(); }
    );

    context.subscriptions.push(
        copyContextAtCursorCommand,
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
