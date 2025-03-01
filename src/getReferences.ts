import * as vscode from 'vscode';

import { FunctionDefinition } from './types';
import { getFunctionDefinition } from './functions';

export async function getReferencesForFunction(
    document: vscode.TextDocument,
    functionDefinition: FunctionDefinition,
    returnTypes = true,
    returnReferencing = false,
): Promise<FunctionDefinition[]> {
    const functionTypeDefinitions = new Map<String, FunctionDefinition>();

    // Get the types for each line in the function
    for (let i = functionDefinition.startLine; i <= functionDefinition.endLine; i++) {
        const lineTypeDefinitions = await getTypeDefinitionsForLine(document, new vscode.Position(i, 0), functionDefinition, returnTypes, returnReferencing);
        for (const typeDef of lineTypeDefinitions) {
            if (typeDef.functionName === functionDefinition.functionName) {
                continue;
            }

            const key = `${typeDef.functionName}`;
            if (!functionTypeDefinitions.has(key)) {
                functionTypeDefinitions.set(key, typeDef);
            }
        }
    }

    return Array.from(functionTypeDefinitions.values());
}

async function getTypeDefinitionsForLine(
    document: vscode.TextDocument,
    position: vscode.Position,
    functionDefinition: FunctionDefinition,
    returnTypes: boolean,
    returnReferencing: boolean,
): Promise<FunctionDefinition[]> {
    const typeDefinitions = new Map<string, FunctionDefinition>();
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
        const typeInfo = await getTypeDefinitionsForPosition(document, pos, functionDefinition, returnTypes, returnReferencing);
        if (typeInfo) {
            for (const typeDef of typeInfo) {
                const key = `${typeDef.functionName}-${typeDef.filename}`;
                typeDefinitions.set(key, typeDef);
            }
        }
    }

    // Return the unique type definitions
    return Array.from(typeDefinitions.values());
}

async function getTypeDefinitionsForPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    functionDefinition: FunctionDefinition,
    returnTypes: boolean,
    returnReferencing: boolean,
): Promise<FunctionDefinition[]> {
    const typesDefinitions: FunctionDefinition[] = [];

    const isLocationInsideFunction = (location: vscode.Location | undefined): boolean => {
        if (!location || !location.range) { return false; } // Ensure location and range exist

        const { startLine, endLine } = functionDefinition;
        const locationStart = location.range.start.line;
        const locationEnd = location.range.end.line;

        return locationStart >= startLine && locationEnd <= endLine;
    };

    const getFilteredLocations = async (command: string): Promise<vscode.Location[]> => {
        let locations = await vscode.commands.executeCommand<vscode.Location[] | undefined>(
            command,
            document.uri,
            position
        );

        return (locations || []).filter(loc => loc && loc.range && !isLocationInsideFunction(loc));
    };

    // Convert mixed location array to Location[] for compatibility
    let typeLocations = await getAllDefinitions(document, position, returnReferencing);
    let definitionLocationArray = typeLocations.definitionResults.map(loc => {
        if ('targetUri' in loc) {
            // This is a LocationLink
            return new vscode.Location(loc.targetUri, loc.targetRange);
        }
        // This is already a Location
        return loc;
    });

    let referencingLocationArray = typeLocations.referencingResults.map(loc => {
        if ('targetUri' in loc) {
            // This is a LocationLink
            return new vscode.Location(loc.targetUri, loc.targetRange);
        }
        // This is already a Location
        return loc;
    });

    typesDefinitions.push(...await getTypeDefinitionFromLocations(definitionLocationArray, returnTypes, false));
    typesDefinitions.push(...await getTypeDefinitionFromLocations(referencingLocationArray, returnTypes, true));
    return typesDefinitions;
}

async function getAllDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position,
    returnReferencing: boolean,
): Promise<{definitionResults: (vscode.Location | vscode.LocationLink)[], referencingResults: (vscode.Location | vscode.LocationLink)[]}> {
    // Use the executeDefinitionProvider command to get results from all providers
    const definitionResults = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider', 
        document.uri, 
        position
    ) || [];
    
    // Get declaration results as fallback/additional sources
    const declarationResults = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDeclarationProvider', 
        document.uri, 
        position
    ) || [];
    
    // Get type definition results
    const typeDefinitionResults = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeTypeDefinitionProvider', 
        document.uri, 
        position
    ) || [];

    let referencingResults: (vscode.Location | vscode.LocationLink)[] = [];

    if (returnReferencing) {
        referencingResults = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            position,
            { includeDeclaration: true }  // This parameter controls whether to include declarations
        ) || [];
    }
    
    // Combine all results
    const allDefinitionResults = [
        ...definitionResults,
        ...declarationResults,
        ...typeDefinitionResults,
    ];
    
    // Remove duplicates
    return {definitionResults: removeDuplicateLocations(allDefinitionResults), referencingResults: removeDuplicateLocations(referencingResults)};
}

// Helper function to remove duplicate locations
function removeDuplicateLocations(
    locations: (vscode.Location | vscode.LocationLink)[]
): (vscode.Location | vscode.LocationLink)[] {
    const uniqueLocations = new Map<string, vscode.Location | vscode.LocationLink>();
    
    locations.forEach(location => {
        let uri: vscode.Uri;
        let range: vscode.Range;
        
        if (location instanceof vscode.Location) {
            uri = location.uri;
            range = location.range;
        } else {
            // LocationLink case
            uri = location.targetUri;
            range = location.targetRange;
        }
        
        const key = `${uri.toString()}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
        
        if (!uniqueLocations.has(key)) {
            uniqueLocations.set(key, location);
        }
    });
    
    return Array.from(uniqueLocations.values());
}

async function getTypeDefinitionFromLocations(
    locations: vscode.Location[],
    returnTypes: boolean,
    isReference: boolean,
): Promise<FunctionDefinition[]> {
    const typeDefinitions: FunctionDefinition[] = [];
    for (const location of locations) {
        if (!location.uri || !isInWorkspace(location.uri.fsPath) || isIgnoreLocation(location.uri.fsPath)) {
            continue;
        }

        const doc = await vscode.workspace.openTextDocument(location.uri);

        const functionDefinition = await getFunctionDefinition(doc, location.range.start, returnTypes, isReference);

        if (!functionDefinition) {
            continue;
        }

        typeDefinitions.push(functionDefinition);
    }

    return typeDefinitions;
}

function isInWorkspace(fsPath: string): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return false; // No workspace open
    }

    return workspaceFolders.some(folder => fsPath.startsWith(folder.uri.fsPath));
}

function isIgnoreLocation(fsPath: string): boolean {
    const config = vscode.workspace.getConfiguration("raydoc-context");
    const ignoreTypePaths: string[] = config.get("ignoreTypePaths", []);

    return ignoreTypePaths.some(path => fsPath.includes(path));
}
