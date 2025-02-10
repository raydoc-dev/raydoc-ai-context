import * as vscode from 'vscode';
import * as path from 'path';

import { FunctionDefinition, TypeDefinition } from './types';
import { extractParameterPositions } from './functions';

export async function gatherTypeDefinitionsForFunction(
    doc: vscode.TextDocument,
    functionDefinition: FunctionDefinition,
    languageId: string
): Promise<TypeDefinition[]> {
    const types: TypeDefinition[] = [];
    
    const paramPositions = await extractParameterPositions(doc, functionDefinition);

    for (const paramPosition of paramPositions) {
        const typeInfo = await getTypeInfo(doc, paramPosition, languageId);
        if (typeInfo) {
            for (const type of typeInfo) {
                types.push(type);
            }
        }
    }

    // Get variable types
    const variableTypes = await analyzeFunctionVariables(doc, functionDefinition.functionSymbol, languageId);

    for (const [variableName, typeInfo] of variableTypes) {
        if (typeInfo.length > 0) {
            for (const type of typeInfo) {
                // Make sure the type is not already in the list (match by typeName and filename)
                if (types.find(t => t.typeName === type.typeName && t.filename === type.filename)) {
                    continue;
                }
                types.push(type);
            }
        }
    }

    return types;
}

export async function analyzeFunctionVariables(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    languageId: string
): Promise<Map<string, TypeDefinition[]>> {
    const variableTypes = new Map<string, TypeDefinition[]>();
    let text = document.getText(functionSymbol.range);

    // Common keywords across languages
    const commonKeywords = new Set([
        'function', 'func', 'self',
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
                const typeInfo = await getTypeInfo(document, position, languageId);
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

export async function getTypeInfo(
    document: vscode.TextDocument,
    position: vscode.Position,
    languageId: string
): Promise<TypeDefinition[] | undefined> {
    const types: TypeDefinition[] = [];
    
    // First try type definition provider
    const typeDefs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        document.uri,
        position
    );

    if (typeDefs && typeDefs.length > 0) {
        for (const typeDef of typeDefs) {
            if (isStandardLibLocation(typeDef.uri.fsPath)) {
                continue;
            }

            const typeText = await extractFullTypeDeclaration(typeDef, languageId);
            if (!typeText) {
                continue;
            }

            const typeName = extractTypeName(typeText);

            types.push({
                typeName,
                filename: path.basename(typeDef.uri.fsPath),
                typeText
            });
        }
    }

    // If no valid types found, try definition provider as fallback
    if (types.length === 0) {
        const defTypes = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            document.uri,
            position
        );

        if (defTypes) {
            for (const defType of defTypes) {
                if (!defType.uri || isStandardLibLocation(defType.uri.fsPath)) {
                    continue;
                }

                const typeText = await extractFullTypeDeclaration(defType, languageId);
                if (!typeText) {
                    continue;
                }

                const typeName = extractTypeName(typeText);

                types.push({
                    typeName,
                    filename: path.basename(defType.uri.fsPath),
                    typeText
                });
            }
        }
    }

    return types.length > 0 ? types : undefined;
}

function extractTypeName(typeText: string): string {
    const match = typeText.match(/(interface|class|type|enum)\s+(\w+)/);
    return match ? match[2] : "unknown";
}

function isStandardLibLocation(fsPath: string): boolean {
    return fsPath.includes('node_modules/typescript/lib/') || 
           fsPath.includes('node_modules') ||
           fsPath.includes('lib.es') ||
           fsPath.includes('go/src') ||
           fsPath.includes('stdlib') ||
           fsPath.includes('python3');
}

// Extract full type definition (not just identifier)
async function extractFullTypeDeclaration(location: vscode.Location, languageId: string): Promise<string | undefined> {
    try {
        const doc = await vscode.workspace.openTextDocument(location.uri);
        const fileText = doc.getText();
        let typeText = getFullTextInRange(doc, location.range).trim();

        // Expand range to get the full type declaration
        var fullType: string | undefined;
        if (languageId !== 'python') {
            fullType = extractSurroundingType(fileText, location.range);
        } else {
            fullType = extractSurroundingTypePython(fileText, location.range);
        }
        if (fullType && (fullType.split(' ')[0] === "package" || fullType.split(' ')[0] === "import")) {
            fullType = typeText;
        }
        return fullType || typeText || undefined;
    } catch (error) {
        console.log("Failed to extract full type declaration:", error);
        return undefined;
    }
}

function getFullTextInRange(doc: vscode.TextDocument, range: vscode.Range): string {
    let startLine = range.start.line;
    let endLine = range.end.line;
    let lines: string[] = [];
  
    // Loop through each line in the range
    for (let i = startLine; i <= endLine; i++) {
        let startPos = new vscode.Position(i, 0);  // Start at the beginning of the line
        let endPos = new vscode.Position(i + 1, 0); // End at the beginning of the next line
        let lineText = doc.getText(new vscode.Range(startPos, endPos));

        // If the line is too long (minified line), skip expanding to previous lines
        if (lineText.length > 1000) {
            lines.push(lineText);
            continue;
        }

        // If the line is short (not minified), expand to the previous line
        if (i === startLine) {
            let previousLine = i - 1 >= 0 ? doc.getText(new vscode.Range(new vscode.Position(i - 1, 0), new vscode.Position(i, 0))).trim() : '';
            lineText = previousLine + '\n' + lineText;
        }

        lines.push(lineText);
    }
  
    // Join all lines and return the full text
    return lines.join('');
}


// Expands the extracted range to get the full type definition
function extractSurroundingType(fileText: string, range: vscode.Range): string | undefined {
    const lines = fileText.split("\n");
    const startLine = range.start.line;
    const endLine = range.end.line;

    // Look for the start of the type definition (interface, type, class, enum)
    let start = startLine;
    while (start > 0 && !/^\s*(interface|type|class|enum)\s+\w+/.test(lines[start])) {
        start--;
    }

    // Look for the end (matching curly braces)
    let end = endLine;
    let openBraces = 0;
    let foundStart = false;

    for (let i = start; i < lines.length; i++) {
        if (lines[i].includes("{")) {
            openBraces++;
            foundStart = true;
        }
        if (lines[i].includes("}")) {
            openBraces--;
            if (foundStart && openBraces === 0) {
                end = i;
                break;
            }
        }
    }

    // Extract full type definition
    const extractedType = lines.slice(start, end + 1).join("\n").trim();
    return extractedType || undefined;
}

function extractSurroundingTypePython(fileText: string, range: vscode.Range): string | undefined {
    const lines = fileText.split("\n").filter(line => line.trim() !== "");
    const startLine = range.start.line;
    const endLine = range.end.line;

    // Look for the start of the type definition (interface, type, class, enum)
    let start = startLine;
    while (start > 0 && !/^\s*(interface|type|class|enum)\s+\w+/.test(lines[start])) {
        start--;
    }

    // If no start found, return undefined
    if (start <= 0) { return undefined; }

    // Determine the indentation level of the start line
    const startIndentation = lines[start].search(/\S/);

    // Look for the end of the type definition
    let end = endLine;
    let foundStart = false;

    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        const currentIndentation = line.search(/\S/);

        // If we're outside the block indentation and it's not a blank line, we've hit the end of the current type
        if (currentIndentation < startIndentation && foundStart) {
            end = i;
            break;
        }

        // Detect the start of a nested type definition
        if (/^\s*(interface|type|class|enum)\s+\w+/.test(line)) {
            foundStart = true;
        }
    }

    // Extract full type definition
    const extractedType = lines.slice(start, end + 1).join("\n").trim();
    return extractedType || undefined;
}

