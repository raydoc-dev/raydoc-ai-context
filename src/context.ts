import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';

import { getPackageDependencies } from './packages';
import { generateFileTree } from './fileTree';
import { getReferencesForFunction } from './getReferences';
import { getFunctionDefinition } from './functions';
import { RaydocContext, FunctionDefinition } from './types';

export async function gatherContext(
    doc: vscode.TextDocument,
    selection: vscode.Selection,
    diag?: vscode.Diagnostic
): Promise<RaydocContext | undefined> {
    // 1) Which file are we in?
    const filepath = getFilePath(doc);

    // 2) Gather all main function definitions within this selection
    const functionDefns = await getFunctionsInSelection(doc, selection);
    if (functionDefns.length === 0) {
        return undefined;
    }

    // 3) Deduplicate references across all main functions
    const typeDefnMap = new Map<string, FunctionDefinition>();
    const refFnMap = new Map<string, FunctionDefinition>();
    const implFnMap = new Map<string, FunctionDefinition>();
    const usedFiles = new Set<string>();
    usedFiles.add(filepath);

    // For each main function found, gather references & type definitions
    for (const fn of functionDefns) {
        // Mark that we use that function’s file
        usedFiles.add(fn.filename);

        // “true” in getReferencesForFunction means get type defs?
        // or you might have separate calls. Adjust to match your logic.
        const typeDefs = await getReferencesForFunction(doc, fn, true);
        for (const t of typeDefs) {
            typeDefnMap.set(`${t.functionName}:${t.filename}`, t);
            usedFiles.add(t.filename);
        }

        const refFns = await getReferencesForFunction(doc, fn, false);
        for (const r of refFns) {
            refFnMap.set(`${r.functionName}:${r.filename}`, r);
            usedFiles.add(r.filename);
        }

        const implFns = await getReferencesForFunction(doc, fn, false, true);
        for (const i of implFns) {
            implFnMap.set(`${i.functionName}:${i.filename}`, i);
            usedFiles.add(i.filename);
        }
    }

    // 4) Now we have potential overlap where some references appear in both.
    //    If your logic requires removing overlap, do it. Example:
    for (const [key, refFn] of refFnMap) {
        if (typeDefnMap.has(key)) {
            // remove duplicates if you want
            // e.g. typeDefnMap.delete(key);
            // Or do nothing if it’s okay for them to appear in both arrays
        }
    }

    // 5) Build the immediate context lines from selection +/- 3 lines
    const immediateContextLines = buildImmediateContextLines(doc, selection);

    // 6) Build the file tree for all used files
    const fileTree = await generateFileTree(usedFiles);

    // 7) Finally, create one RaydocContext
    const context: RaydocContext = {
        filepath,
        // A single line can be the first main function’s start line (or selection.start.line)
        line: selection.start.line,
        errorMessage: diag?.message,
        languageId: doc.languageId,
        runtime: process.version,
        runtimeVersion: await getLanguageVersion(doc.languageId),
        runtimePath: '',
        packages: getPackageDependencies(doc.languageId),
        functionDefns,
        typeDefns: Array.from(typeDefnMap.values()),
        referencedFunctions: Array.from(refFnMap.values()),
        referencingDefns: Array.from(implFnMap.values()),
        immediateContextLines,
        fileTree
    };

    return context;
}

function getFilePath(doc: vscode.TextDocument): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return doc.uri.fsPath; // fallback
    }
    const projectRoot = workspaceFolders[0].uri.fsPath;
    return path.relative(projectRoot, doc.uri.fsPath);
}

/**
 * Find all function definitions that intersect the user’s selection.
 * This naive approach tries each line in the range. You can optimize as needed.
 */
async function getFunctionsInSelection(
    doc: vscode.TextDocument,
    selection: vscode.Selection
): Promise<FunctionDefinition[]> {
    const found: FunctionDefinition[] = [];
    const start = selection.start.line;
    const end = selection.end.line;
    for (let line = start; line <= end; line++) {
        // We just check a position at the start of each line
        const position = new vscode.Position(line, 0);
        const fnDef = await getFunctionDefinition(doc, position, false, true);
        if (fnDef) {
            const key = `${fnDef.functionName}:${fnDef.startLine}:${fnDef.endLine}:${fnDef.filename}`;
            // Deduplicate
            if (!found.some(f => 
                `${f.functionName}:${f.startLine}:${f.endLine}:${f.filename}` === key
            )) {
                found.push(fnDef);
            }
        }
    }
    return found;
}

/**
 * Build context lines from selection.start.line - 3 to selection.end.line + 3,
 * marking each line within the selection with ">>>".
 */
function buildImmediateContextLines(
    doc: vscode.TextDocument,
    selection: vscode.Selection
): string {
    const lineCount = doc.lineCount;
    const startLine = Math.max(0, selection.start.line - 3);
    const endLine = Math.min(lineCount - 1, selection.end.line + 3);

    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
        if (i >= selection.start.line && i <= selection.end.line) {
            // This line is in the user’s highlighted block
            lines.push(`>>> ${doc.lineAt(i).text}`);
        } else {
            lines.push(`    ${doc.lineAt(i).text}`);
        }
    }
    return lines.join('\n');
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
