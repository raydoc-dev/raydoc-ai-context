import * as vscode from 'vscode';
import { DocumentSymbol, SymbolKind } from 'vscode';
import { FunctionDefinition } from './types';

export async function getFunctionDefinition(
    doc: vscode.TextDocument,
    position: vscode.Position,
    findTypes = false
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

    // 2) Find the largest function symbol that contains the cursor position
    const functionSymbol = getLargestFunctionSymbolForPosition(doc, symbols, position, findTypes);

    // If we didn't find a function symbol, we can't proceed
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
        let isFunction = false;
        let isType = false;

        switch (doc.languageId) {
            case 'python':
                ({ isFunction, isType } = isFunctionAndTypePython(symbol));
                break;
            case 'typescript':
                ({ isFunction, isType } = isFunctionAndTypeTypescript(symbol));
                break;
            case 'typescriptreact':
                ({ isFunction, isType } = isFunctionAndTypeTypescript(symbol));
                break;
            case 'javascript':
                ({ isFunction, isType } = isFunctionAndTypeJavascript(symbol));
                break;
            case 'go':
                ({ isFunction, isType } = isFunctionAndTypeGo(symbol));
                break;
            case 'cpp':
                ({ isFunction, isType } = isFunctionAndTypeCpp(symbol));
                break;
            default:
                break;
        }

        // Check if symbol is inside an enum
        if (isInsideEnum(symbol, symbols)) {
            isFunction = false;
            isType = false;
        }

        if (
            ((isFunction && !findTypes) ||
                (isType && findTypes)) &&
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

function isFunctionAndTypePython(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor;
    const isType = symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface;
    return { isFunction, isType };
}

function isFunctionAndTypeTypescript(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor || symbol.kind === SymbolKind.Variable;
    const isType = symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface || symbol.kind === SymbolKind.Variable;
    return { isFunction, isType };
}

function isFunctionAndTypeJavascript(symbol: DocumentSymbol): { isFunction: boolean, isType: boolean } {
    const isFunction = symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Constructor;
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
        case 'go':
            return getFunctionDefinitionGo(doc, functionSymbol);
        case 'cpp':
            return getFunctionDefinitionCpp(doc, functionSymbol);
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
    }
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
