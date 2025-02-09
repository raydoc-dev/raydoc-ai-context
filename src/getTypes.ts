import * as vscode from 'vscode';
import * as ts from 'typescript';

async function getTypeInfo(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string[] | undefined> {
    // First try getting type definition
    const typeDefs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        document.uri,
        position
    );

	const types: string[] = [];

	console.log("Type Definitions:", typeDefs);

	for (const typeDef of typeDefs) {
		if (isStandardLibLocation(typeDef.uri.fsPath)) {
			continue;
		}

		console.log("Type Definition:", typeDef);

		const type = await extractTypeDeclaration(typeDef);

		if (type) {
			types.push(type);
		}
	}

	if (types.length > 0) {
		return types;
	}

	const type = await getHoverTypeInfo(document, position);

	if (type) {
		return [type];
	}

	return undefined;
}

function isStandardLibLocation(fsPath: string): boolean {
    return fsPath.includes('node_modules/typescript/lib/') || 
           fsPath.includes('lib.es');
}

async function getHoverTypeInfo(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string | undefined> {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        position
    );

    console.log("Hovers:", hovers);

    if (!hovers?.length) return undefined;

    return hovers[0].contents
        .map(content => {
            if (typeof content === 'string') return content;
            if ('value' in content) return content.value;
            return String(content);
        })
        .join('\n')
        .trim();
}

async function extractTypeDeclaration(location: vscode.Location): Promise<string | undefined> {
    try {
        const doc = await vscode.workspace.openTextDocument(location.uri);
        const fileText = doc.getText();
        const sourceFile = ts.createSourceFile(
            doc.fileName,
            fileText,
            ts.ScriptTarget.ES2020,
            true
        );

        const offset = doc.offsetAt(location.range.start);
        const node = findRelevantNode(sourceFile, offset);

        console.log("Node:", node);
        
        if (!node) return undefined;
        
        return fileText.substring(node.getFullStart(), node.getEnd()).trim();
    } catch {
        return undefined;
    }
}

function findRelevantNode(sourceFile: ts.Node, offset: number): ts.Node | undefined {
    let relevantNode: ts.Node | undefined;
    
    function visit(node: ts.Node) {
        const start = node.getFullStart();
        const end = node.getEnd();
        
        if (start <= offset && offset < end) {
            if (ts.isInterfaceDeclaration(node) ||
                ts.isClassDeclaration(node) ||
                ts.isEnumDeclaration(node) ||
                ts.isTypeAliasDeclaration(node)) {
                relevantNode = node;
            }
            node.forEachChild(visit);
        }
    }
    
    visit(sourceFile);
    return relevantNode;
}