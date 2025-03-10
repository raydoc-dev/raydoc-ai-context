import * as vscode from 'vscode';
import { DocumentSymbol, SymbolKind } from 'vscode';
import { FunctionDefinition } from './types';

export async function getFunctionDefinition(
    doc: vscode.TextDocument,
    position: vscode.Position,
    findTypes = false,
    expandToFunction = false,
): Promise<FunctionDefinition | undefined> {
    // 1) Get all the symbols in the document
    let symbols = await vscode.commands.executeCommand<DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
    );

    // If we didn't get any symbols, we can't proceed
    if (!symbols) {
        return undefined;
    }

    // Flatten the symbols to make processing easier and more standardized
    symbols = flattenDocumentSymbols(symbols);

    // 2) Find the symbol that contains the cursor position
    let functionSymbol: DocumentSymbol | undefined;

    if (expandToFunction) {
        // Use the existing behavior to get the largest function symbol
        functionSymbol = getLargestFunctionSymbolForPosition(doc, symbols, position, findTypes);
    } else {
        // Get any symbol at the position, regardless of type
        functionSymbol = getSymbolAtPosition(doc, symbols, position, findTypes);
    }

    // If we didn't find a symbol, we can't proceed
    if (!functionSymbol) {
        return undefined;
    }

    // 3) Pull out each of the parts of the function definition from the symbol;
    return functionDefinitionByLanguage(doc, functionSymbol);
}

function flattenDocumentSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
    const flattenedSymbols: DocumentSymbol[] = [];

    for (const symbol of symbols) {
        flattenedSymbols.push(symbol);
        if (symbol.children) {
            flattenedSymbols.push(...flattenDocumentSymbols(symbol.children));
        }
    }

    return flattenedSymbols;
}

function getLargestFunctionSymbolForPosition(
    doc: vscode.TextDocument,
    symbols: DocumentSymbol[],
    position: vscode.Position,
    findTypes: boolean,
): DocumentSymbol | undefined {
    let largestFunctionSymbol: DocumentSymbol | undefined;

    for (const symbol of symbols) {
        if (
            isValidSymbol(doc, symbols, symbol, findTypes) &&
            symbol.range.contains(position)
        ) {
            if (!largestFunctionSymbol || isLargerRange(symbol.range, largestFunctionSymbol.range)) {
                largestFunctionSymbol = symbol;
            }
        }
    }

    return largestFunctionSymbol;
}

function isInsideEnum(symbol: DocumentSymbol, symbols: DocumentSymbol[]): boolean {
    return symbols.some(parentSymbol =>
        parentSymbol.kind === SymbolKind.Enum && parentSymbol.range.contains(symbol.range)
    );
}

/**
 * Gets any symbol at the given position, regardless of type
 */
function getSymbolAtPosition(
    doc: vscode.TextDocument,
    symbols: DocumentSymbol[],
    position: vscode.Position,
    findTypes: boolean,
): DocumentSymbol | undefined {
    // Find the smallest symbol that contains the position
    let smallestSymbol: DocumentSymbol | undefined;

    for (const symbol of symbols) {
        if (symbol.range.contains(position)) {
            // If we haven't found a symbol yet, or this one is smaller than the current one
            if (!smallestSymbol || isSmallestRange(symbol.range, smallestSymbol.range)) {
                smallestSymbol = symbol;
            }
        }
    }

    if (smallestSymbol && !isValidSymbol(doc, symbols, smallestSymbol, findTypes)) {
        return undefined;
    }

    if (smallestSymbol && smallestSymbol.range.start.line !== position.line) {
        return undefined;
    }

    return smallestSymbol;
}

/**
 * Helper function to determine if range1 is smaller than range2
 */
function isSmallestRange(range1: vscode.Range, range2: vscode.Range): boolean {
    const size1 = getRangeSize(range1);
    const size2 = getRangeSize(range2);
    return size1 < size2;
}

function isValidSymbol(doc: vscode.TextDocument, symbols: DocumentSymbol[], symbol: DocumentSymbol, findTypes: boolean): boolean {
    let isFunction = false;
    let isType = false;

    ({ isFunction, isType } = isFunctionAndType(doc, symbol));

    // Check if symbol is inside an enum
    if (isInsideEnum(symbol, symbols)) {
        isFunction = false;
        isType = false;
    }

    return ((isFunction && !findTypes) ||
        (isType && findTypes));
}

function isFunctionAndType(doc: vscode.TextDocument, symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    let isFunction = false;
    let isType = false;

    switch (doc.languageId) {
        case 'python':
            ({ isFunction, isType } = isFunctionAndTypePython(symbol));
            break;
        case 'typescript':
            ({ isFunction, isType } = isFunctionAndTypeTypescript(symbol, doc));
            break;
        case 'typescriptreact':
            ({ isFunction, isType } = isFunctionAndTypeTypescript(symbol, doc));
            break;
        case 'javascript':
            ({ isFunction, isType } = isFunctionAndTypeJavascript(symbol, doc));
            break;
        case 'javascriptreact':
            ({ isFunction, isType } = isFunctionAndTypeJavascript(symbol, doc));
            break;
        case 'go':
            ({ isFunction, isType } = isFunctionAndTypeGo(symbol));
            break;
        case 'cpp':
            ({ isFunction, isType } = isFunctionAndTypeCpp(symbol));
            break;
        case 'csharp':
            ({ isFunction, isType } = isFunctionAndTypeCsharp(symbol));
            break;
        default:
            break;
    }

    return { isFunction, isType };
}

function isFunctionAndTypePython(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor;
    const isType = symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface;
    return { isFunction, isType };
}

function isArrowFunction(doc: vscode.TextDocument, symbol: DocumentSymbol): boolean {
    if (symbol.kind !== SymbolKind.Variable) {
        return false;
    }

    const text = doc.getText(symbol.range);

    // This removes line breaks and extra whitespace to simplify pattern matching
    const normalizedText = text.replace(/\s+/g, ' ').trim();

    // Check if we're in a TypeScript file
    const isTypeScript = doc.languageId === 'typescript' || doc.languageId === 'typescriptreact';

    // More comprehensive regex that handles various edge cases
    let arrowFunctionRegex;

    if (isTypeScript) {
        // TypeScript regex with type annotations
        arrowFunctionRegex = /(?:export\s+)?(?:const|let|var)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]*>)?(?::\s*[^=]+)?\s*=\s*(?:<[^>]*>)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::\s*[^=]+)?\s*=>/;
    } else {
        // JavaScript regex without type annotations
        arrowFunctionRegex = /(?:export\s+)?(?:const|let|var)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/;
    }

    return arrowFunctionRegex.test(normalizedText);
}

function isTypeDefinition(doc: vscode.TextDocument, symbol: DocumentSymbol): boolean {
    if (symbol.kind !== SymbolKind.Variable) {
        return false;
    }
    const text = doc.getText(symbol.range);
    // Match type keyword followed by name and equals
    const typeDefRegex = /^\s*(?:export\s+)?type\s+[A-Za-z_][A-Za-z0-9_]*\s*=/;
    return typeDefRegex.test(text);
}

function isFunctionAndTypeTypescript(symbol: DocumentSymbol, doc: vscode.TextDocument): { isFunction: boolean, isType: boolean } {
    const isFunction =
        symbol.kind === SymbolKind.Function ||
        symbol.kind === SymbolKind.Method ||
        symbol.kind === SymbolKind.Constructor ||
        isArrowFunction(doc, symbol);
    const isType =
        symbol.kind === SymbolKind.Class ||
        symbol.kind === SymbolKind.Interface ||
        isTypeDefinition(doc, symbol);
    return { isFunction, isType };
}

function isFunctionAndTypeJavascript(symbol: DocumentSymbol, doc: vscode.TextDocument): { isFunction: boolean, isType: boolean } {
    const isFunction =
        symbol.kind === SymbolKind.Function ||
        symbol.kind === SymbolKind.Method ||
        symbol.kind === SymbolKind.Constructor ||
        isArrowFunction(doc, symbol);
    const isType = symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface || symbol.kind === SymbolKind.Variable;
    return { isFunction, isType };
}

function isFunctionAndTypeGo(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor;
    const isType = symbol.kind === SymbolKind.Struct || symbol.kind === SymbolKind.Interface;
    return { isFunction, isType };
}

function isFunctionAndTypeCpp(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor;
    const isType = symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface || symbol.kind === SymbolKind.Struct;
    return { isFunction, isType };
}

function isFunctionAndTypeCsharp(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor;
    const isType = symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface || symbol.kind === SymbolKind.Struct;
    return { isFunction, isType };
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

function functionDefinitionByLanguage(
    doc: vscode.TextDocument,
    functionSymbol: DocumentSymbol
): FunctionDefinition | undefined {
    switch (doc.languageId) {
        case 'python':
            return getFunctionDefinitionPython(doc, functionSymbol);
        case 'typescript':
            return getFunctionDefinitionTypescript(doc, functionSymbol);
        case 'typescriptreact':
            return getFunctionDefinitionTypescript(doc, functionSymbol);
        case 'javascript':
            return getFunctionDefinitionJavascript(doc, functionSymbol);
        case 'javascriptreact':
            return getFunctionDefinitionJavascript(doc, functionSymbol);
        case 'go':
            return getFunctionDefinitionGo(doc, functionSymbol);
        case 'cpp':
            return getFunctionDefinitionCpp(doc, functionSymbol);
        case 'csharp':
            return getFunctionDefinitionCsharp(doc, functionSymbol);
        default:
            return undefined;
    }
}

function getFunctionDefinitionPython(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    return {
        functionName: symbol.name,
        filename: vscode.workspace.asRelativePath(doc.fileName),
        functionText: doc.getText(symbol.range),
        functionSymbol: symbol,
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
    };
}

function getFunctionDefinitionTypescript(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    return {
        functionName: symbol.name,
        filename: vscode.workspace.asRelativePath(doc.fileName),
        functionText: doc.getText(symbol.range),
        functionSymbol: symbol,
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
    };
}

function getFunctionDefinitionJavascript(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    return {
        functionName: symbol.name,
        filename: vscode.workspace.asRelativePath(doc.fileName),
        functionText: doc.getText(symbol.range),
        functionSymbol: symbol,
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
    };
}

function getFunctionDefinitionGo(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    return {
        functionName: symbol.name,
        filename: vscode.workspace.asRelativePath(doc.fileName),
        functionText: doc.getText(symbol.range),
        functionSymbol: symbol,
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
    };
}

function getFunctionDefinitionCpp(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    return {
        functionName: symbol.name,
        filename: vscode.workspace.asRelativePath(doc.fileName),
        functionText: doc.getText(symbol.range),
        functionSymbol: symbol,
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
    };
}

function getFunctionDefinitionCsharp(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    return {
        functionName: symbol.name,
        filename: vscode.workspace.asRelativePath(doc.fileName),
        functionText: doc.getText(symbol.range),
        functionSymbol: symbol,
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
    };
}
