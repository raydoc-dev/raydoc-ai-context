import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';

import { getPackageDependencies } from './packages';
import { FunctionDefinition, RaydocContext } from "./types";
import { generateFileTree } from './fileTree';
import { getReferencesForFunction } from './getReferences';
import { getFunctionDefinition } from './functions';

export async function gatherContext(
    doc: vscode.TextDocument,
    position: vscode.Position,
    diag: vscode.Diagnostic | undefined
): Promise<RaydocContext | undefined> {
    const filepath = getFilePath(doc);
    const line = position.line;
    const immediateContextLines = await getImmediateContextLines(doc, position);
    const errorMessage = diag?.message || undefined;
    const languageId = doc.languageId;
    const runtime = process.version;
    const runtimeVersion = await getLanguageVersion(doc.languageId);
    const runtimePath = '';
    const packages = getPackageDependencies(doc.languageId);
    const functionDefn = await getFunctionDefinition(doc, position, false, true);

    var typeDefns: FunctionDefinition[] = [];
    if (functionDefn) {
        typeDefns = await getReferencesForFunction(doc, functionDefn);
    } else {
        return undefined;
    }

    var referencedFunctions: FunctionDefinition[] = [];

    if (functionDefn) {
        referencedFunctions = await getReferencesForFunction(doc, functionDefn, false);
    }

    // Filter out referencedFunctions that match a typeDefn (same functionName & filename)
    const typeDefnSet = new Set(typeDefns.map(def => `${def.functionName}:${def.filename}`));
    referencedFunctions = referencedFunctions.filter(
        ref => !typeDefnSet.has(`${ref.functionName}:${ref.filename}`)
    );

    const usedFiles = new Set<string>();
    usedFiles.add(filepath);

    for (const typeDefn of typeDefns) {
        usedFiles.add(typeDefn.filename);
    }

    const fileTree = await generateFileTree(usedFiles);

    const context: RaydocContext = {
        filepath,
        line,
        immediateContextLines,
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
export async function getLanguageVersion(languageId: string): Promise<string | undefined> {
    let cmd: string | undefined;
    switch (languageId) {
        case 'python':
            return await getPythonVersion();
            break;
        case 'go':
            cmd = 'go version';
            break;
        case 'typescript':
            cmd = 'tsc --version';  // TypeScript version
            break;
        case 'javascript':
            cmd = 'node --version';  // Node.js version (JavaScript runtime)
            break;
        default:
            return undefined;
    }
    if (!cmd) { return undefined; }

    try {
        const output = cp.execSync(cmd, { encoding: 'utf-8' }).trim();
        // Remove any newlines or other whitespace and the word 'version'
        const cleanedOutput = output.replace(/[\n\r]/g, '').replace(/Version/g, '').trim();
        return cleanedOutput;
    } catch {
        return undefined;
    }
}

export async function getImmediateContextLines(
    doc: vscode.TextDocument,
    position: vscode.Position
): Promise<string> {
    const lineCount = doc.lineCount;
    const lineNumber = position.line;
    
    // Get lines before, including the current line, and after
    const startLine = Math.max(0, lineNumber - 3); // Ensure we don't go below line 0
    const endLine = Math.min(lineCount - 1, lineNumber + 3); // Ensure we don't go above the last line

    const contextLines: string[] = [];
    
    // Collect the lines in the context range
    for (let i = startLine; i <= endLine; i++) {
        if (i === lineNumber) {
            contextLines.push(`>>> ${doc.lineAt(i).text}`); // Highlight the current line
        } else {
            contextLines.push(`    ${doc.lineAt(i).text}`); // Push each line's text into the array
        }
    }

    // Join all context lines with a newline separator and return
    return contextLines.join('\n');
}

const execPromise = util.promisify(cp.exec);

async function getPythonVersion(): Promise<string | undefined> {
    // Get the Python extension
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');

    if (!pythonExtension) {
        return undefined;
    }

    // Activate the Python extension if not already activated
    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }

    // Access the Python extension API
    const pythonAPI = pythonExtension.exports;

    // Get the active interpreter (path to Python executable)
    const activeEnv = await pythonAPI.environments.getActiveEnvironmentPath();
    
    if (!activeEnv || !activeEnv.path) {
        return undefined;
    }

    const interpreterPath = activeEnv.path; // Extract the actual executable path

    try {
        // Run "python --version" using Node.js child_process
        const { stdout, stderr } = await execPromise(`"${interpreterPath}" --version`);

        const version = stdout.trim() || stderr.trim();
        return version;
    } catch (error) {
        // Ensure 'error' is an instance of Error before accessing 'message'
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to get Python version: ${errorMessage}`);
        return undefined;
    }
}
