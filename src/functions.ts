import * as vscode from 'vscode';
import { DocumentSymbol, SymbolKind } from 'vscode';
import { symbolContainingRange } from './symbols';
import { FunctionDefinition } from './types';

/**
 * Retrieves the text (and range) of the function (regular or arrow) that encloses `position`
 * using the document symbol provider. If none is found, returns the entire document as a fallback.
 */
export async function getEnclosingFunction(
    doc: vscode.TextDocument,
    position: vscode.Position
): Promise<FunctionDefinition | undefined> {
    // Fetch top-level symbols
    const symbols = await vscode.commands.executeCommand<DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
    );

    // No symbols at all => fallback
    if (!symbols || symbols.length === 0) {
        return entireDocumentFallback(doc);
    }

    const arrowOrFunctionSymbol = locateArrowOrFunctionSymbol(symbols, position);
    if (!arrowOrFunctionSymbol) {
        // If we can’t confirm it's a function or arrow function, fallback
        return entireDocumentFallback(doc);
    }

    const text = doc.getText(arrowOrFunctionSymbol.range);
    return {
        filename: doc.fileName,
        functionText: text,
        functionSymbol: arrowOrFunctionSymbol,
    };
}

/**
 * If we can't find any enclosing function/arrow function symbol, return the entire document.
 */
function entireDocumentFallback(doc: vscode.TextDocument): FunctionDefinition {
    const fullText = doc.getText();
    // We'll create a pseudo-symbol that spans the entire file
    const entireRange = new vscode.Range(0, 0, doc.lineCount, 0);

    const fileSymbol = new vscode.DocumentSymbol(
        doc.fileName,
        'Entire Document',
        SymbolKind.File,
        entireRange,
        entireRange
    );

    return {
        filename: doc.fileName,
        functionText: fullText,
        functionSymbol: fileSymbol
    };
}

/**
 * Given a symbol that encloses `position`, determine if it's:
 * 1) Already a function (Function, Method, or Constructor), or
 * 2) A variable with a child function symbol (common for arrow functions),
 * 3) or neither.
 *
 * Returns the "function-like" symbol if found, else undefined.
 */
function locateArrowOrFunctionSymbol(
    symbols: DocumentSymbol[],
    position: vscode.Position
): DocumentSymbol | undefined {
    // First try to find function symbols at the current level that contain the position
    let largestFunctionSymbol: DocumentSymbol | undefined;
    
    for (const symbol of symbols) {
        if (
            (symbol.kind === SymbolKind.Function ||
                symbol.kind === SymbolKind.Method ||
                symbol.kind === SymbolKind.Constructor) &&
            symbol.range.contains(position)
        ) {
            // If we haven't found a function yet, or if this one has a larger range
            if (!largestFunctionSymbol || 
                isLargerRange(symbol.range, largestFunctionSymbol.range)) {
                largestFunctionSymbol = symbol;
            }
        }
    }
    
    // If we found a function at this level, return it
    if (largestFunctionSymbol) {
        return largestFunctionSymbol;
    }
    
    // Otherwise, collect all children that contain the position
    const relevantChildren: DocumentSymbol[] = [];
    for (const symbol of symbols) {
        if (symbol.range.contains(position)) {
            relevantChildren.push(...symbol.children);
        }
    }
    
    // If we have relevant children, recurse with them
    if (relevantChildren.length > 0) {
        return locateArrowOrFunctionSymbol(relevantChildren, position);
    }
    
    // If no functions found at this level or in children
    return undefined;
}

// Helper function to determine if range1 is larger than range2
function isLargerRange(range1: vscode.Range, range2: vscode.Range): boolean {
    const size1 = getRangeSize(range1);
    const size2 = getRangeSize(range2);
    return size1 > size2;
}

// Helper function to calculate the size of a range
function getRangeSize(range: vscode.Range): number {
    // If the range is on multiple lines
    if (range.start.line !== range.end.line) {
        return (
            // Count full lines
            (range.end.line - range.start.line) * Number.MAX_SAFE_INTEGER +
            // Plus characters in the last line
            range.end.character
        );
    }
    // If the range is on a single line
    return range.end.character - range.start.character;
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

export function extractParameterPositions(
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
        if (param.length === 0) { return; }

        const paramOffset = functionDefintion.functionText.indexOf(param, currentOffset);
        const absoluteOffset = doc.offsetAt(functionDefintion.functionSymbol.range.start) + paramOffset;
        paramPositions.push(doc.positionAt(absoluteOffset));

        currentOffset = paramOffset + param.length;
    });

    return paramPositions;
}
