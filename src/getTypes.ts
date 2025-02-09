import * as vscode from 'vscode';

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
           fsPath.includes('lib.es');
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
