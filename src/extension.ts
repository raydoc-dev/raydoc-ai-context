import * as vscode from 'vscode';
import { gatherErrorContext } from './gatherError';
import { contextToString } from './toString';
import { getEnclosingFunction, extractParameterPositions } from './functions';
import { getTypeInfo } from './getTypes';

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

    // Get function signature help
    // await getFunctionSignatureHelp(doc, functionDefinition.functionSymbol);

    const types: string[] = [];

    const paramPositions = await extractParameterPositions(doc, functionDefinition);

    for (const paramPosition of paramPositions) {
        const typeInfo = await getTypeInfo(doc, paramPosition);
        if (typeInfo) {
            for (const type of typeInfo) {
                types.push(type);
            }
        }
    }

    // Get variable types
    const variableTypes = await analyzeFunctionVariables(doc, functionDefinition.functionSymbol);

    for (const [variableName, typeInfo] of variableTypes) {
        if (typeInfo.length > 0) {
            for (const type of typeInfo) {
                types.push(type);
            }
        }
    }

    // Remove duplicates from types
    const uniqueTypes = [...new Set(types)];

    console.log('Types:', uniqueTypes);
}

async function analyzeFunctionVariables(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol
): Promise<Map<string, string[]>> {
    const variableTypes = new Map<string, string[]>();
    let text = document.getText(functionSymbol.range);

    // Common keywords across languages
    const commonKeywords = new Set([
        'function', 'func',
        functionSymbol.name
    ]);

    // Use regex to extract potential variable names
    const identifierRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
    const words = Array.from(new Set(text.match(identifierRegex) || []))
        .filter(word => {
            // Filter out common keywords
            if (commonKeywords.has(word)) { return false; }

            // Filter out likely method calls (followed by parentheses)
            if (text.match(new RegExp(`${word}\\s*\\(`))) { return false; }

            return true;
        });

    // Create a Set to track processed words to avoid duplicates
    const processedWords = new Set<string>();

    // Process each potential variable
    for (const word of words) {
        if (processedWords.has(word)) {
            continue;
        }
        processedWords.add(word);

        const positions = findAllWordPositions(document, functionSymbol, word);
        
        // Try each position until we find valid type information
        for (const position of positions) {
            try {
                const typeInfo = await getTypeInfo(document, position);
                if (typeInfo && typeInfo.length > 0) {
                    variableTypes.set(word, typeInfo);
                    break;  // Found valid type info, no need to check other positions
                }
            } catch (error) {
                console.log(`Error getting type info for ${word} at position ${position.line}:${position.character}: ${error}`);
                continue;
            }
        }
    }

    return variableTypes;
}

function findAllWordPositions(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    word: string
): vscode.Position[] {
    const positions: vscode.Position[] = [];
    const text = document.getText(functionSymbol.range);
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        let startIndex = 0;
        while (true) {
            const index = lines[i].indexOf(word, startIndex);
            if (index === -1) { break; }
            
            // Check if the word is a complete token (not part of a larger word)
            const beforeChar = index > 0 ? lines[i][index - 1] : ' ';
            const afterChar = index + word.length < lines[i].length 
                ? lines[i][index + word.length] 
                : ' ';
                
            if (!/[a-zA-Z0-9_$]/.test(beforeChar) && !/[a-zA-Z0-9_$]/.test(afterChar)) {
                // Create position relative to the document
                positions.push(new vscode.Position(
                    functionSymbol.range.start.line + i,
                    index
                ));
            }
            
            startIndex = index + word.length;
        }
    }
    
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
