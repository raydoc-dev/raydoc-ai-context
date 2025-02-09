import * as vscode from 'vscode';
import { TypeDefinition } from './types';

/**
 * Finds the document symbol (function, method, etc.) that encloses `position`.
 * If children are more specific, we descend into them.
 */
export function findEnclosingSymbol(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
): vscode.DocumentSymbol | undefined {
    for (const s of symbols) {
        if (s.range.contains(position)) {
            // See if any child is narrower
            const child = findEnclosingSymbol(s.children, position);
            return child || s;
        }
    }
    return undefined;
}

/**
 * A naive approach to detect potential "custom types" by looking for
 * capitalized identifiers in the function text, e.g. "MyType", "UserClass", etc.
 */
export function findCustomTypes(funcText: string): string[] {
    // This simplistic regex matches words starting with uppercase letters
    // that might represent classes, interfaces, or custom types.
    const regex = /\b([A-Z]\w+)\b/g;
    const types = new Set<string>();
    let match;
    while ((match = regex.exec(funcText)) !== null) {
        types.add(match[1]);
    }
    return Array.from(types);
}

/**
 * Recursively gather custom type definitions up to a given depth.
 * Example: if the type text references another type, we fetch that too (depth=2).
 *
 * - doc, hintPosition: used to locate the type's definition initially
 * - typeName: the top-level type we want
 * - depth: how many levels of nested references to chase
 * - visitedTypeNames: keep track of type names we've already processed to avoid loops
 */
export async function gatherTypeDefinitionRecursive(
    doc: vscode.TextDocument,
    hintPosition: vscode.Position,
    typeName: string,
    depth: number,
    visitedTypeNames: Set<string>,
    includeComments: boolean
): Promise<TypeDefinition[]> {
    const results: TypeDefinition[] = [];

    // If we've already visited this type or depth is 0, stop
    if (depth <= 0 || visitedTypeNames.has(typeName)) {
        return results;
    }
    visitedTypeNames.add(typeName);

    // 1) Find the immediate definition
    const typeDef = await findTypeDefinition(doc, hintPosition, typeName);
    if (!typeDef) {
        return results; // Not found
    }

    // We discovered this type
    const fullPath = typeDef.uri.fsPath;
    const relPath = vscode.workspace.asRelativePath(fullPath);
    var typeDefText = typeDef.text;
    if (!includeComments) {
        typeDefText = typeDefText.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '');
    }

    results.push({
        typeName,
        filename: relPath,
        typeText: typeDefText,
    });

    // 2) Parse the discovered text for nested custom types
    const subTypes = findCustomTypes(typeDef.text);
    for (const subTypeName of subTypes) {
        // Recursively gather them at depth-1
        const childResults = await gatherTypeDefinitionRecursive(
            doc,
            hintPosition,
            subTypeName,
            depth - 1,
            visitedTypeNames,
            includeComments
        );
        results.push(...childResults);
    }

    return results;
}

/**
 * Uses the "type definition" provider to locate the definition of a custom type (class, interface, etc.).
 * If that fails, we fall back to the normal definition provider.
 */
export async function findTypeDefinition(
    doc: vscode.TextDocument,
    hintPosition: vscode.Position,
    typeName: string
): Promise<{ uri: vscode.Uri; text: string } | undefined> {
    // We'll do a naive approach again: search for the line referencing the typeName,
    // place a cursor inside it, and call "vscode.executeTypeDefinitionProvider"
    // or fallback to "vscode.executeDefinitionProvider".
    for (let lineNum = 0; lineNum < doc.lineCount; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;
        const idx = lineText.indexOf(typeName);
        if (idx !== -1) {
            // 1) Try type definition provider
            const typeLocations = (await vscode.commands.executeCommand(
                'vscode.executeTypeDefinitionProvider',
                doc.uri,
                new vscode.Position(lineNum, idx + 1)
            )) as vscode.Location[] | undefined;

            let defLoc = typeLocations && typeLocations[0];
            if (!defLoc) {
                // 2) Fallback: definition provider
                const defLocations = (await vscode.commands.executeCommand(
                    'vscode.executeDefinitionProvider',
                    doc.uri,
                    new vscode.Position(lineNum, idx + 1)
                )) as vscode.Location[] | undefined;
                defLoc = defLocations && defLocations[0];
            }

            if (defLoc) {
                const defDoc = await vscode.workspace.openTextDocument(defLoc.uri);
                const defSymbols = (await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    defDoc.uri
                )) as vscode.DocumentSymbol[] | undefined;

                if (!defSymbols) {
                    continue;
                }
                // We find the symbol that contains this range
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

/**
 * Finds the symbol that fully contains `targetRange`.
 */
export function symbolContainingRange(
    symbols: vscode.DocumentSymbol[],
    targetRange: vscode.Range
): vscode.DocumentSymbol | undefined {
    for (const s of symbols) {
        if (s.range.contains(targetRange)) {
            const child = symbolContainingRange(s.children, targetRange);
            return child || s;
        }
    }
    return undefined;
}