import * as vscode from 'vscode';
import * as ts from 'typescript';
import { findEnclosingFunctionSymbol, symbolContainingRange } from './symbols';
import { FunctionDefinition } from './types';

/**
 * Retrieves the text (and range) of the function that encloses `position` using the document symbol provider.
 */
export async function getEnclosingFunction(
    doc: vscode.TextDocument,
    position: vscode.Position
): Promise<FunctionDefinition | undefined> {
    const symbols = (await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
    )) as vscode.DocumentSymbol[] | undefined;

    if (!symbols) {
        return undefined;
    }

    const enclosingSymbol = findEnclosingFunctionSymbol(symbols, position);
    if (!enclosingSymbol) {
        return undefined;
    }

    const text = doc.getText(enclosingSymbol.range);
    return {
        filename: doc.fileName,
        functionText: text,
        functionSymbol: enclosingSymbol,
    };
}


/**
 * Naive approach to find function calls in text by regex (e.g., "myFunc(", "someFunction(").
 * Returns an array of function names.
 */
export function findFunctionCalls(funcText: string): string[] {
    // This won't handle obj.method() or advanced cases, but demonstrates the idea.
    const regex = /\b(\w+)\s*\(/g;
    const calls = new Set<string>();
    let match;
    while ((match = regex.exec(funcText)) !== null) {
        calls.add(match[1]);
    }
    return Array.from(calls);
}

/**
 * Attempt to find the definition of `functionName` by searching the doc lines for a call,
 * then using the definition provider. We gather the entire function text from the enclosing symbol.
 */
export async function findFunctionDefinition(
    doc: vscode.TextDocument,
    hintPosition: vscode.Position,
    functionName: string
): Promise<{ uri: vscode.Uri; text: string } | undefined> {
    // A naive approach: search for `functionName(` in the doc, call definition provider, etc.
    for (let lineNum = 0; lineNum < doc.lineCount; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;
        const idx = lineText.indexOf(functionName + '(');
        if (idx !== -1) {
            const defLocations = (await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                doc.uri,
                new vscode.Position(lineNum, idx + 1)
            )) as vscode.Location[] | undefined;

            if (defLocations && defLocations.length) {
                // We'll pick the first definition
                const defLoc = defLocations[0];
                const defDoc = await vscode.workspace.openTextDocument(defLoc.uri);
                const defSymbols = (await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    defDoc.uri
                )) as vscode.DocumentSymbol[] | undefined;

                if (!defSymbols) {
                    continue;
                }
                const symbol = symbolContainingRange(defSymbols, defLoc.range);
                if (!symbol) {
                    continue;
                }
                const text = defDoc.getText(symbol.range);
                return { uri: defDoc.uri, text };
            }
        }
    }
    return undefined;
}
