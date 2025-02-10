import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

import { getPackageDependencies } from './packages';
import { FunctionDefinition, RaydocContext, TypeDefinition } from "./types";
import { getEnclosingFunction } from './functions';
import { gatherTypeDefinitionsForFunction } from './getTypes';
import { generateFileTree } from './fileTree';

export async function gatherContext(
    doc: vscode.TextDocument,
    position: vscode.Position,
    diag: vscode.Diagnostic | undefined
): Promise<RaydocContext | undefined> {
    const filepath = getFilePath(doc);
    const line = position.line;
    const errorMessage = diag?.message || undefined;
    const languageId = doc.languageId;
    const runtime = process.version;
    const runtimeVersion = getLanguageVersion(doc.languageId);
    const runtimePath = '';
    const packages = getPackageDependencies(doc.languageId);
    const functionDefn = await getEnclosingFunction(doc, position);
    const referencedFunctions: FunctionDefinition[] = [];

    var typeDefns: TypeDefinition[] = [];
    if (functionDefn) {
        typeDefns = await gatherTypeDefinitionsForFunction(doc, functionDefn);
    } else {
        return undefined;
    }

    const usedFiles = new Set<string>();
    usedFiles.add(filepath);

    for (const typeDefn of typeDefns) {
        usedFiles.add(typeDefn.filename);
    }

    const fileTree = await generateFileTree(usedFiles);

    const context: RaydocContext = {
        filepath,
        line,
        errorMessage,
        languageId,
        runtime,
        runtimeVersion,
        runtimePath,
        packages,
        functionDefn,
        referencedFunctions,
        typeDefns,
        fileTree
    };

    return context;
}

function getFilePath(doc: vscode.TextDocument): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let projectRoot = '';
    if (workspaceFolders && workspaceFolders?.length) {
        projectRoot = workspaceFolders[0].uri.fsPath;
    }

    const relPath = path.relative(projectRoot, doc.uri.fsPath);
    return relPath;
}

/**
 * Attempt to get an external language version (Python, Go, etc.). Otherwise return undefined.
 */
export function getLanguageVersion(languageId: string): string | undefined {
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