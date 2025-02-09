import * as vscode from 'vscode';
import { gatherErrorContext } from './gatherError';
import { contextToString } from './toString';
import { getEnclosingFunction } from './functions';
import { getTypeInfo } from './getTypes';
import { FunctionDefinition } from './types';

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

    context.subscriptions.push(
        providerDisposable,
        copyErrorContextCommand,
        copyErrorContextAtCursorCommand,
        copyLineContextAtCursorCommand,
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
        vscode.window.showInformationMessage('Raydoc: context copied to clipboard!');
    } else {
        vscode.window.showWarningMessage('No context available to copy.');
    }
}

/**
 * Command handler for "Copy line context" command.
 */
async function copyLineContextAtCursorCommandHandler() {
    console.log('Copy line context at cursor');

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found!');
        return;
    }

    // The position (line, character) where the user's cursor is
    const position = editor.selection.active;

    // The URI (file path) of the currently open document
    const doc = editor.document;

    const functionDefinition = await getEnclosingFunction(doc, position);

    if (!functionDefinition) {
        vscode.window.showErrorMessage('No function found at the current cursor position.');
        return;
    }

    console.log('Function definition:', functionDefinition);

    // Get function signature help
    // await getFunctionSignatureHelp(doc, functionDefinition.functionSymbol);

    const paramPositions = await extractParameterPositionsFromText(doc, functionDefinition);

    console.log('Parameter positions:', paramPositions);

    for (const paramPosition of paramPositions) {
        const typeInfo = await getTypeInfo(doc, paramPosition);
        console.log('Type Info:', typeInfo);
    }
}

async function getFunctionSignatureHelp(doc: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol) {
    const functionCallPosition = new vscode.Position(
        functionSymbol.range.start.line,
        functionSymbol.range.start.character + functionSymbol.name.length + 1 // Inside parentheses
    );

    const signatureHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider',
        doc.uri,
        functionCallPosition
    );

    if (signatureHelp && signatureHelp.signatures.length > 0) {
        console.log(`Function Signature: ${signatureHelp.signatures[0].label}`);
        console.log(
            "Parameters:",
            signatureHelp.signatures[0].parameters.map(p => p.label)
        );
    } else {
        console.log("No signature help available.");
    }

    return signatureHelp;
}

function extractParameterPositionsFromText(
    doc: vscode.TextDocument,
    functionDefintion: FunctionDefinition,
): vscode.Position[] {
    const startOffset = functionDefintion.functionText.indexOf('(');
    const endOffset = functionDefintion.functionText.indexOf(')');

    if (startOffset === -1 || endOffset === -1 || startOffset > endOffset) {
        console.log("No valid parameter list found.");
        return [];
    }

    // Extract parameter list text
    const paramListText = functionDefintion.functionText.substring(startOffset + 1, endOffset);

    // Split parameters and track positions
    let currentOffset = startOffset + 1; // Offset relative to functionText
    const paramPositions: vscode.Position[] = [];

    paramListText.split(',').map(param => param.trim()).forEach(param => {
        if (param.length === 0) return;

        const paramOffset = functionDefintion.functionText.indexOf(param, currentOffset);
        const absoluteOffset = doc.offsetAt(functionDefintion.functionSymbol.range.start) + paramOffset;
        paramPositions.push(doc.positionAt(absoluteOffset));

        currentOffset = paramOffset + param.length;
    });

    return paramPositions;
}

async function getFunctionParameterPositions(functionSymbol: vscode.DocumentSymbol, doc: vscode.TextDocument): Promise<vscode.Position[]> {
    // Extract function text
    const functionText = doc.getText(functionSymbol.range);

    // Get parameter positions
    const paramPositions = extractParameterPositions(functionText, functionSymbol.range, doc);
    return paramPositions;
}

function extractParameterPositions(functionText: string, functionRange: vscode.Range, doc: vscode.TextDocument): vscode.Position[] {
    const match = functionText.match(/function\s+\w+\s*\(([^)]*)\)/);
    if (!match) { return []; }

    const paramList = match[1]; // Everything inside (param1, param2)
    const params = paramList.split(',').map(p => p.trim());

    let startOffset = functionText.indexOf('(') + 1; // Start after '('
    const positions: vscode.Position[] = [];

    params.forEach(param => {
        if (param.length === 0) { return; }

        const paramOffset = functionText.indexOf(param, startOffset); // Find param in function text
        const absoluteOffset = functionRange.start.translate(0, paramOffset); // Convert to absolute position

        positions.push(absoluteOffset);
        startOffset = paramOffset + param.length; // Move forward to avoid duplicate matches
    });

    return positions;
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
