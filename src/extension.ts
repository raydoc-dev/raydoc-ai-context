import * as vscode from 'vscode';
import { contextToString, contextToStringLlm } from './toString';
import { gatherContext } from './context';
import { getFunctionDefinition } from './functions';
import { FunctionDefinition } from './types';

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
        vscode.commands.executeCommand("github.copilot.chat.attachSelection");
    } else {
        vscode.commands.executeCommand("composer.startComposerPrompt");
    }
}

function getSelectionFromFunctionDefinition(doc: vscode.TextDocument, functionDefinition: FunctionDefinition): vscode.Selection {
    return new vscode.Selection(
        new vscode.Position(functionDefinition.startLine, 0),
        new vscode.Position(functionDefinition.endLine, doc.lineAt(functionDefinition.endLine).text.length)
    );
}
