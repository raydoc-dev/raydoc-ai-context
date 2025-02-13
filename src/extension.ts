import * as vscode from 'vscode';
import { contextToString } from './toString';
import { gatherContext } from './context';
import { getFunctionDefinition } from './functions';

export function activate(context: vscode.ExtensionContext) {
    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => { copyContextAtCursorCommandHandler(); }
    );

    const sendContextToLlmCommand = vscode.commands.registerCommand(
        'raydoc-context.sendContextToLlm',
        async () => { sendContextToLlmCommandHandler(); }
    );

    context.subscriptions.push(
        copyContextAtCursorCommand,
        sendContextToLlmCommand,
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

async function sendContextToLlmCommandHandler() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor.');
        return;
    }

    const position = editor.selection.active; // Cursor position
    const doc = editor.document;

    const functionDefinition = await getFunctionDefinition(doc, position);
    console.log(functionDefinition);

    if (!functionDefinition) {
        vscode.window.showErrorMessage('No function definition found for the current cursor position.');
        return;
    }
}
