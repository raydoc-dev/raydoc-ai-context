import * as vscode from 'vscode';
import * as path from 'path';

import { FunctionDefinition, TypeDefinition } from './types';
import { getFunctionDefinition } from './functions';

export async function getTypesForFunction(
    document: vscode.TextDocument,
    functionDefinition: FunctionDefinition,
): Promise<TypeDefinition[]> {
    const functionTypeDefinitions = new Map<String, TypeDefinition>;

    // Get the types for each line in the function
    for (let i = functionDefinition.startLine; i <= functionDefinition.endLine; i++) {
        const lineTypeDefinitions = await getTypesForLine(document, new vscode.Position(i, 0));
        for (const typeDef of lineTypeDefinitions) {
            const key = `${typeDef.typeName}-${typeDef.filename}`;
            if (!functionTypeDefinitions.has(key)) {
                functionTypeDefinitions.set(key, typeDef);
            }
        }
    }

    return Array.from(functionTypeDefinitions.values());
}

async function getTypesForLine(
    document: vscode.TextDocument,
    position: vscode.Position,
): Promise<TypeDefinition[]> {
    const typeDefinitions = new Map<string, TypeDefinition>();
    const line = document.lineAt(position.line).text;

    // Change all non-alphabet characters to spaces
    const words = line.replace(/[^a-zA-Z]/g, ' ');

    // Find the position of each word in the line
    const positions: vscode.Position[] = [];
    let inWord = false;
    for (let i = 0; i < words.length; i++) {
        const character = words[i];
        if (character === ' ') {
            inWord = false;
            continue;
        }

        if (!inWord) {
            positions.push(new vscode.Position(position.line, i));
            inWord = true;
        }
    }

    for (const pos of positions) {
        const typeInfo = await getTypesForPosition(document, pos);
        if (typeInfo) {
            for (const typeDef of typeInfo) {
                const key = `${typeDef.typeName}-${typeDef.filename}`;
                typeDefinitions.set(key, typeDef);
            }
        }
    }

    // Return the unique type definitions
    return Array.from(typeDefinitions.values());
}

async function getTypesForPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
): Promise<TypeDefinition[]> {
    const typesDefinitions: TypeDefinition[] = [];
    
    // First try type definition provider
    let typeLocations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeTypeDefinitionProvider',
        document.uri,
        position
    );

    if (typeLocations && typeLocations.length > 0) {
        typesDefinitions.push(...await getTypeDefinitionFromLocations(typeLocations));

        // If we found valid types, return them
        if (typesDefinitions.length > 0) {
            return typesDefinitions;
        }
    }

    // If we didn't have any valid types, try definition provider as a fallback
    typeLocations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
    );

    if (typeLocations && typeLocations.length > 0) {
        typesDefinitions.push(...await getTypeDefinitionFromLocations(typeLocations));
    }

    return typesDefinitions;
}

async function getTypeDefinitionFromLocations(
    locations: vscode.Location[],
): Promise<TypeDefinition[]> {
    const typeDefinitions: TypeDefinition[] = [];
    for (const location of locations) {
        if (!location.uri || !isInWorkspace(location.uri.fsPath) || isStandardLibLocation(location.uri.fsPath)) {
            continue;
        }

        const doc = await vscode.workspace.openTextDocument(location.uri);

        const functionDefinition = await getFunctionDefinition(doc, location.range.start, true);

        if (!functionDefinition) {
            continue;
        }

        const typeName = extractTypeName(functionDefinition.functionText);

        typeDefinitions.push({
            typeName,
            filename: path.basename(location.uri.fsPath),
            typeText: functionDefinition.functionText
        });
    }

    return typeDefinitions;
}

function extractTypeName(typeText: string): string {
    const match = typeText.match(/(interface|class|type|enum)\s+(\w+)/);
    return match ? match[2] : "unknown";
}

function isInWorkspace(fsPath: string): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return false; // No workspace open
    }

    return workspaceFolders.some(folder => fsPath.startsWith(folder.uri.fsPath));
}

function isStandardLibLocation(fsPath: string): boolean {
    return fsPath.includes('node_modules') ||
           fsPath.includes('stdlib') ||
           fsPath.includes('python3') ||
           fsPath.includes('toml.hpp');
}
