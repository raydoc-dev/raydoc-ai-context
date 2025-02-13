import * as vscode from 'vscode';
import { DocumentSymbol, SymbolKind } from 'vscode';
import { symbolContainingRange } from './symbols';
import { FunctionDefinition } from './types';

export async function getFunctionDefinition(
    doc: vscode.TextDocument,
    position: vscode.Position,
    includeClasses = false
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
    const functionSymbol = getLargestFunctionSymbolForPosition(symbols, position, includeClasses);

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
    symbols: DocumentSymbol[],
    position: vscode.Position,
    includeClasses: boolean,
): DocumentSymbol | undefined {
    let largestFunctionSymbol: DocumentSymbol | undefined;

    for (const symbol of symbols) {
        if (
            (symbol.kind === SymbolKind.Function ||
                symbol.kind === SymbolKind.Method ||
                symbol.kind === SymbolKind.Constructor ||
                (symbol.kind === SymbolKind.Class && includeClasses)) &&
            symbol.range.contains(position)
        ) {
            if (!largestFunctionSymbol || isLargerRange(symbol.range, largestFunctionSymbol.range)) {
                largestFunctionSymbol = symbol;
            }
        }
    }

    return largestFunctionSymbol;
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
        default:
            return undefined;
    }
}

function getFunctionDefinitionPython(
    doc: vscode.TextDocument,
    symbol: DocumentSymbol
): FunctionDefinition {
    const fileText = doc.getText();
    const lines = fileText.split('\n');

    const startLine = symbol.range.start.line;
    let endLine = startLine;

    // Determine the indentation level of the start line
    const startIndentation = lines[startLine].search(/\S/);

    // Look for the end of the function definition
    for (endLine < lines.length; endLine++;) {
        const line = lines[endLine];

        if (line.trim() === "") {
            continue;
        }

        const currentIndentation = line.search(/\S/);

        // If we're outside the block indentation and it's not a blank line, we've hit the end of the current type
        if (currentIndentation <= startIndentation && endLine > startLine) {
            endLine--;
            break;
        }
    }

    // Create the function definition object
    const functionText = lines.slice(startLine, endLine + 1).join('\n').trim();
    const filename = doc.fileName;

    return {
        filename,
        functionText,
        functionSymbol: symbol,
        startLine,
        endLine,
    };
}
