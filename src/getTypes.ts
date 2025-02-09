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

        const type = await extractTypeDeclaration(typeDef);
        if (type) {
            types.push(type);
        }
    }

    if (types.length > 0) {
        return types;
    }

    // Fallback to hover-based type info
    const type = await getHoverTypeInfo(document, position);
    return type ? [type] : undefined;
}

function isStandardLibLocation(fsPath: string): boolean {
    return fsPath.includes('node_modules/typescript/lib/') || 
           fsPath.includes('lib.es');
}

// Extract type declaration directly from VS Code API instead of parsing with TypeScript
async function extractTypeDeclaration(location: vscode.Location): Promise<string | undefined> {
    try {
        const doc = await vscode.workspace.openTextDocument(location.uri);
        const text = doc.getText(location.range).trim();

        console.log("Extract type declaration: ", text);

        return text || undefined;
    } catch {
        console.log("Failed to extract type declaration");
        return undefined;
    }
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
