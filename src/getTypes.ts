import * as vscode from 'vscode';

export async function analyzeFunctionVariables(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol
): Promise<Map<string, string[]>> {
    const variableTypes = new Map<string, string[]>();
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

export async function getTypeInfo(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string[] | undefined> {
    // Get type definitions using VS Code's LSP
    const typeDefs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        document.uri,
        position
    );

    const types: string[] = [];

    for (const typeDef of typeDefs || []) {
        if (isStandardLibLocation(typeDef.uri.fsPath)) {
            continue;
        }

        const type = await extractFullTypeDeclaration(typeDef);
        if (type) {
            // Remove go package definitions that sometimes show up
            if (type.split(' ')[0] === 'package') {
                continue;
            }

            types.push(type);
        }
    }

    if (types.length > 0) {
        return types;
    }

    // Fallback to definition provider (sometimes gives more context)
    const defTypes = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
    );

    for (const defType of defTypes || []) {
        if (!defType.uri) {
            continue;
        }

        if (isStandardLibLocation(defType.uri.fsPath)) {
            continue;
        }

        const type = await extractFullTypeDeclaration(defType);
        if (type) {
            // Remove go package definitions that sometimes show up
            if (type.split(' ')[0] === 'package') {
                continue;
            }

            types.push(type);
        }
    }

    if (types.length > 0) {
        return types;
    }

    return undefined;

    // Fallback to hover-based type info
    // const type = await getHoverTypeInfo(document, position);
    // return type ? [type] : undefined;
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
async function extractFullTypeDeclaration(location: vscode.Location): Promise<string | undefined> {
    try {
        const doc = await vscode.workspace.openTextDocument(location.uri);
        const fileText = doc.getText();
        let typeText = doc.getText(location.range).trim();

        // Expand range to get the full type declaration
        const fullType = extractSurroundingType(fileText, location.range);
        return fullType || undefined;
    } catch (error) {
        console.log("Failed to extract full type declaration:", error);
        return undefined;
    }
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

// Fallback: Get type information from hover tooltips
async function getHoverTypeInfo(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string | undefined> {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        position
    );

    if (!hovers?.length) {
        return undefined;
    }

    return hovers[0].contents
        .map(content => (typeof content === 'string' ? content : 'value' in content ? content.value : String(content)))
        .join('\n')
        .trim();
}
