import * as vscode from 'vscode';
import { gatherErrorContext } from './gatherError';
import { contextToString } from './toString';
import { gatherContext } from './context';
import { getTypeInfo, getTypesForLine } from './getTypes';

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

    // 2) Register the "copy error context" command invoked by the Code Action
    const copyErrorContextCommand = vscode.commands.registerCommand(
        'raydoc-context.copyErrorContext',
        async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => { copyErrorContextCommandHandler(uri, diagnostic); }
    );

    const copyErrorContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyErrorContextAtCursor',
        async () => { copyErrorContextAtCursorCommandHandler(); }
    );

    const copyLineContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyLineContextAtCursor',
        async () => { copyLineContextAtCursorCommandHandler(); }
    );

    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => { copyContextAtCursorCommandHandler(); }
    );

    const inspectTypsAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.inspectTypesAtCursor',
        async () => { inspectTypesAtCursorCommandHandler(); }
    );

    context.subscriptions.push(
        providerDisposable,
        copyErrorContextCommand,
        copyErrorContextAtCursorCommand,
        copyLineContextAtCursorCommand,
        copyContextAtCursorCommand,
        inspectTypsAtCursorCommand,
    );
}

export function deactivate() {
    // Cleanup if needed
}

/**
 * Command handler for "Copy context" command.
 */
async function copyErrorContextCommandHandler(uri: vscode.Uri, diagnostic: vscode.Diagnostic) {
    // Gather all context data (environment, function text, file tree, etc.)
    const context = await gatherErrorContext(uri, diagnostic);
    if (!context) {
        vscode.window.showWarningMessage('No context available to copy.');
        return;
    }
    const output = contextToString(context);
    if (output) {
        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage('Raydoc: Context copied to clipboard!');
    } else {
        vscode.window.showWarningMessage('No context available to copy.');
    }
}

/**
 * Command handler for "Copy context at cursor" command.
 */
async function copyErrorContextAtCursorCommandHandler() {
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
    if (!diag) {
        vscode.window.showWarningMessage('No error at the current cursor position.');
        return;
    }

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

/**
 * Command handler for "Copy line context" command.
 */
async function copyLineContextAtCursorCommandHandler() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found!');
        return;
    }

    // The position (line, character) where the user's cursor is
    const position = editor.selection.active;

    // The URI (file path) of the currently open document
    const doc = editor.document;

    const context = await gatherContext(doc, position, undefined);

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

async function inspectTypesAtCursorCommandHandler() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found!');
        return;
    }

    // The position (line, character) where the user's cursor is
    const position = editor.selection.active;

    // The current document
    const doc = editor.document;

    const type = await getTypesForLine(doc, position);
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
                const action = new vscode.CodeAction('Copy error context', vscode.CodeActionKind.QuickFix);
                // This quick fix invokes our command with the document URI and this diagnostic
                action.command = {
                    command: 'raydoc-context.copyErrorContext',
                    title: 'Copy error context',
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
