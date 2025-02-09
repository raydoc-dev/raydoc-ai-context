import * as vscode from 'vscode';
import * as path from 'path';
import { RaydocContext, TypeDefinition } from './types';
import { getPackageDependencies } from './packages';
import * as cp from 'child_process';
import { findCustomTypes, gatherTypeDefinitionRecursive } from './symbols';
import { findFunctionCalls, findFunctionDefinition, getEnclosingFunction } from './functions';
import { generateFileTree } from './fileTree';

/**
 * Gathers the entire context for a given error:
 * - Node/External version info, dependencies
 * - The enclosing function text
 * - Any functions that function calls (their full text)
 * - Any custom types (depth=2) used in that function
 * - A workspace file tree with used files marked by '*'
 */
export async function gatherErrorContext(
    uri: vscode.Uri,
    diag: vscode.Diagnostic
): Promise<RaydocContext | undefined> {
    const depth = vscode.workspace.getConfiguration('raydoc-context').get<number>('depth', 2);
    const includeComments = vscode.workspace.getConfiguration('raydoc-context').get<boolean>('includeComments', false);

    const doc = await vscode.workspace.openTextDocument(uri);

    const usedFiles = new Set<string>();
    usedFiles.add(uri.fsPath);

    const workspaceFolders = vscode.workspace.workspaceFolders;
    let projectRoot = '';
    if (workspaceFolders && workspaceFolders?.length) {
        projectRoot = workspaceFolders[0].uri.fsPath;
    }

    const relPath = path.relative(projectRoot, uri.fsPath);

    const functionDefinition = await getEnclosingFunction(doc, diag.range.start);

    if (!functionDefinition) {
        return undefined;
    }

    const context: RaydocContext = {
        filepath: relPath,
        line: diag.range.start.line + 1,
        errorMessage: diag.message,
        languageId: doc.languageId,
        runtime: process.version,
        runtimeVersion: getLanguageVersion(doc.languageId),
        runtimePath: '',
        packages: getPackageDependencies(doc.languageId),
        functionDefn: functionDefinition,
        typeDefns: [],
        fileTree: undefined,
    };

    const calledFunctionNames = findFunctionCalls(functionDefinition.functionText);
    for (const fnName of calledFunctionNames) {
        const fnDef = await findFunctionDefinition(doc, functionDefinition.functionSymbol.range.start, fnName);
        if (fnDef) {
            usedFiles.add(fnDef.uri.fsPath);
        }
    }

    // 3) Find custom types used in this function (depth = 2)
    const immediateTypes = findCustomTypes(functionDefinition.functionText);

    // We'll store all discovered type definitions in a list
    const discoveredTypeDefs: TypeDefinition[] = [];

    // Use a visited set for type names, so we don't loop infinitely
    const visitedTypeNames = new Set<string>();

    for (const typeName of immediateTypes) {
        // gatherTypeDefinitionRecursive fetches this type + its sub-types up to depth=2
        const typeResults = await gatherTypeDefinitionRecursive(
            doc,
            functionDefinition.functionSymbol.range.start,
            typeName,
            depth,
            visitedTypeNames,
            includeComments
        );
        for (const tDef of typeResults) {
            discoveredTypeDefs.push(tDef);
            usedFiles.add(tDef.filename);
        }
    }

    context.typeDefns = discoveredTypeDefs;

    // 4) Generate a file tree for the entire workspace, marking used files
    const fileTree = await generateFileTree(usedFiles);
    context.fileTree = fileTree;

    return context;
}

/**
 * Attempt to get an external language version (Python, Go, etc.). Otherwise return undefined.
 */
function getLanguageVersion(languageId: string): string | undefined {
    let cmd: string | undefined;
    switch (languageId) {
        case 'python':
            cmd = 'python --version';
            break;
        case 'go':
            cmd = 'go version';
            break;
        // Add more if needed (java, rust, etc.)
        default:
            return undefined;
    }
    if (!cmd) { return undefined; }

    try {
        const output = cp.execSync(cmd, { encoding: 'utf-8' }).trim();
        return output;
    } catch {
        return undefined;
    }
}
