import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('raydoc-context');
    const enabled = config.get('enabled');
    const includeComments = config.get('includeComments');
    const depth = config.get('depth');

    if (!enabled) {
        return;
    }

    // 1) Register a Code Action Provider for errors:
    const codeActionProvider = new ErrorContextCodeActionProvider();
    const providerDisposable = vscode.languages.registerCodeActionsProvider(
        // Register for all languages; you can narrow to { language: 'typescript' }, etc.
        { scheme: 'file', language: '*' },
        codeActionProvider,
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    );

    // 2) Register the "copy context" command invoked by the Code Action
    const copyContextCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContext',
        async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
            // Gather all context data (environment, function text, file tree, etc.)
            const output = await gatherErrorContext(uri, diagnostic);
            if (output) {
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage('Error context copied to clipboard!');
            } else {
                vscode.window.showWarningMessage('No context available to copy.');
            }
        }
    );

    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        async () => {
            // Attempt to detect an error at the current cursor position
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active text editor.');
                return;
            }

            const position = editor.selection.active; // Cursor position
            const docUri = editor.document.uri;

            // Get all diagnostics for this file
            const diagnostics = vscode.languages.getDiagnostics(docUri);

            // Find a diagnostic that covers the cursor position
            const diag = diagnostics.find(d => d.range.contains(position));
            if (!diag) {
                vscode.window.showWarningMessage('No error at the current cursor position.');
                return;
            }

            // We found an error at the cursor position; gather context
            const output = await gatherErrorContext(docUri, diag);
            if (output) {
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage('Error context copied to clipboard!');
            } else {
                vscode.window.showWarningMessage('No context available to copy.');
            }
        }
    );

    context.subscriptions.push(providerDisposable, copyContextCommand, copyContextAtCursorCommand);
}

export function deactivate() {
    // Cleanup if needed
}

/**
 * A Code Action Provider that offers a "Copy context" quick fix for each error diagnostic.
 */
class ErrorContextCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            if (diag.severity === vscode.DiagnosticSeverity.Error) {
                // Create a CodeAction for "Copy context"
                const action = new vscode.CodeAction('Copy context', vscode.CodeActionKind.QuickFix);
                // This quick fix invokes our command with the document URI and this diagnostic
                action.command = {
                    command: 'raydoc-context.copyContext',
                    title: 'Copy context',
                    arguments: [document.uri, diag],
                };
                // Associate it with the diagnostic so it shows on the lightbulb for this error
                action.diagnostics = [diag];

                actions.push(action);
            }
        }
        return actions;
    }
}

/**
 * Gathers the entire context for a given error:
 * - Node/External version info, dependencies
 * - The enclosing function text
 * - Any functions that function calls (their full text)
 * - Any custom types (depth=2) used in that function
 * - A workspace file tree with used files marked by '*'
 */
async function gatherErrorContext(uri: vscode.Uri, diag: vscode.Diagnostic): Promise<string | undefined> {
    const doc = await vscode.workspace.openTextDocument(uri);

    // Basic environment info
    const languageId = doc.languageId;
    const nodeVersion = process.version;
    const externalVersionInfo = getLanguageVersion(languageId);
    const packages = getPackageJsonDependencies();

    // We'll track which files we use so we can mark them in the file tree
    const usedFiles = new Set<string>();
    usedFiles.add(uri.fsPath);

    const workspaceFolders = vscode.workspace.workspaceFolders;
    let projectRoot = '';
    if (workspaceFolders && workspaceFolders?.length) {
        projectRoot = workspaceFolders[0].uri.fsPath;
    }

    const relPath = path.relative(projectRoot, uri.fsPath);

    // Start building our output text
    let output = `=== Error Context ===\nFile: ${relPath}\nLine: ${diag.range.start.line + 1}\n`;
    output += `Message: ${diag.message}\n\n`;
    output += `Node.js version (extension host): ${nodeVersion}\n`;
    if (externalVersionInfo) {
        output += `External version info: ${externalVersionInfo}\n`;
    }
    if (packages) {
        output += `Detected dependencies:\n${JSON.stringify(packages, null, 2)}\n`;
    }

    // 1) Enclosing function text
    const functionData = await getEnclosingFunctionText(doc, diag.range.start);
    if (!functionData) {
        output += `\n(No enclosing function found for this error.)\n`;
    } else {
        output += `\n--- Enclosing function (${path.basename(doc.uri.fsPath)}) ---\n`;
        output += functionData.text + '\n';

        // 2) Find functions that this function calls
        const calledFunctionNames = findFunctionCalls(functionData.text);
        for (const fnName of calledFunctionNames) {
            const fnDef = await findFunctionDefinition(doc, functionData.range.start, fnName);
            if (fnDef) {
                usedFiles.add(fnDef.uri.fsPath);
                output += `\n--- Function "${fnName}" (${path.basename(fnDef.uri.fsPath)}) ---\n`;
                output += fnDef.text + '\n';
            }
        }

        // 3) Find custom types used in this function (depth = 2)
        const immediateTypes = findCustomTypes(functionData.text);

        // We'll store all discovered type definitions in a list
        const discoveredTypeDefs: Array<{
            typeName: string;
            uri: vscode.Uri;
            text: string;
        }> = [];

        // Use a visited set for type names, so we don't loop infinitely
        const visitedTypeNames = new Set<string>();

        for (const typeName of immediateTypes) {
            // gatherTypeDefinitionRecursive fetches this type + its sub-types up to depth=2
            const typeResults = await gatherTypeDefinitionRecursive(
                doc,
                functionData.range.start,
                typeName,
                2,                 // depth
                visitedTypeNames
            );
            for (const tDef of typeResults) {
                discoveredTypeDefs.push(tDef);
                usedFiles.add(tDef.uri.fsPath);
            }
        }

        // Now we append all discovered type definitions to the output
        // (some might come from the same file, etc.)
        for (const tDef of discoveredTypeDefs) {
            output += `\n--- Custom Type "${tDef.typeName}" (${path.basename(tDef.uri.fsPath)}) ---\n`;
            output += tDef.text + '\n';
        }
    }

    // 4) Generate a file tree for the entire workspace, marking used files
    const fileTree = await generateFileTree(usedFiles);
    output += `\n=== Workspace File Tree (files used for context are marked with "*") ===\n`;
    output += fileTree;

    return output;
}

/**
 * Retrieves the text (and range) of the function that encloses `position` using the document symbol provider.
 */
async function getEnclosingFunctionText(
    doc: vscode.TextDocument,
    position: vscode.Position
): Promise<{ text: string; range: vscode.Range } | undefined> {
    const symbols = (await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
    )) as vscode.DocumentSymbol[] | undefined;

    if (!symbols) {
        return undefined;
    }

    const enclosingSymbol = findEnclosingSymbol(symbols, position);
    if (!enclosingSymbol) {
        return undefined;
    }

    const text = doc.getText(enclosingSymbol.range);
    return { text, range: enclosingSymbol.range };
}

/**
 * Finds the document symbol (function, method, etc.) that encloses `position`.
 * If children are more specific, we descend into them.
 */
function findEnclosingSymbol(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
): vscode.DocumentSymbol | undefined {
    for (const s of symbols) {
        if (s.range.contains(position)) {
            // See if any child is narrower
            const child = findEnclosingSymbol(s.children, position);
            return child || s;
        }
    }
    return undefined;
}

/**
 * Naive approach to find function calls in text by regex (e.g., "myFunc(", "someFunction(").
 * Returns an array of function names.
 */
function findFunctionCalls(funcText: string): string[] {
    // This won't handle obj.method() or advanced cases, but demonstrates the idea.
    const regex = /\b(\w+)\s*\(/g;
    const calls = new Set<string>();
    let match;
    while ((match = regex.exec(funcText)) !== null) {
        calls.add(match[1]);
    }
    return Array.from(calls);
}

/**
 * Attempt to find the definition of `functionName` by searching the doc lines for a call,
 * then using the definition provider. We gather the entire function text from the enclosing symbol.
 */
async function findFunctionDefinition(
    doc: vscode.TextDocument,
    hintPosition: vscode.Position,
    functionName: string
): Promise<{ uri: vscode.Uri; text: string } | undefined> {
    // A naive approach: search for `functionName(` in the doc, call definition provider, etc.
    for (let lineNum = 0; lineNum < doc.lineCount; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;
        const idx = lineText.indexOf(functionName + '(');
        if (idx !== -1) {
            const defLocations = (await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                doc.uri,
                new vscode.Position(lineNum, idx + 1)
            )) as vscode.Location[] | undefined;

            if (defLocations && defLocations.length) {
                // We'll pick the first definition
                const defLoc = defLocations[0];
                const defDoc = await vscode.workspace.openTextDocument(defLoc.uri);
                const defSymbols = (await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    defDoc.uri
                )) as vscode.DocumentSymbol[] | undefined;

                if (!defSymbols) {
                    continue;
                }
                const symbol = symbolContainingRange(defSymbols, defLoc.range);
                if (!symbol) {
                    continue;
                }
                const text = defDoc.getText(symbol.range);
                return { uri: defDoc.uri, text };
            }
        }
    }
    return undefined;
}

/**
 * A naive approach to detect potential "custom types" by looking for
 * capitalized identifiers in the function text, e.g. "MyType", "UserClass", etc.
 */
function findCustomTypes(funcText: string): string[] {
    // This simplistic regex matches words starting with uppercase letters
    // that might represent classes, interfaces, or custom types.
    const regex = /\b([A-Z]\w+)\b/g;
    const types = new Set<string>();
    let match;
    while ((match = regex.exec(funcText)) !== null) {
        types.add(match[1]);
    }
    return Array.from(types);
}

/**
 * Recursively gather custom type definitions up to a given depth.
 * Example: if the type text references another type, we fetch that too (depth=2).
 *
 * - doc, hintPosition: used to locate the type's definition initially
 * - typeName: the top-level type we want
 * - depth: how many levels of nested references to chase
 * - visitedTypeNames: keep track of type names we've already processed to avoid loops
 */
async function gatherTypeDefinitionRecursive(
    doc: vscode.TextDocument,
    hintPosition: vscode.Position,
    typeName: string,
    depth: number,
    visitedTypeNames: Set<string>
): Promise<Array<{ typeName: string; uri: vscode.Uri; text: string }>> {
    const results: Array<{ typeName: string; uri: vscode.Uri; text: string }> = [];

    // If we've already visited this type or depth is 0, stop
    if (depth <= 0 || visitedTypeNames.has(typeName)) {
        return results;
    }
    visitedTypeNames.add(typeName);

    // 1) Find the immediate definition
    const typeDef = await findTypeDefinition(doc, hintPosition, typeName);
    if (!typeDef) {
        return results; // Not found
    }

    // We discovered this type
    results.push({
        typeName,
        uri: typeDef.uri,
        text: typeDef.text,
    });

    // 2) Parse the discovered text for nested custom types
    const subTypes = findCustomTypes(typeDef.text);
    for (const subTypeName of subTypes) {
        // Recursively gather them at depth-1
        const childResults = await gatherTypeDefinitionRecursive(
            doc,
            hintPosition,
            subTypeName,
            depth - 1,
            visitedTypeNames
        );
        results.push(...childResults);
    }

    return results;
}

/**
 * Uses the "type definition" provider to locate the definition of a custom type (class, interface, etc.).
 * If that fails, we fall back to the normal definition provider.
 */
async function findTypeDefinition(
    doc: vscode.TextDocument,
    hintPosition: vscode.Position,
    typeName: string
): Promise<{ uri: vscode.Uri; text: string } | undefined> {
    // We'll do a naive approach again: search for the line referencing the typeName,
    // place a cursor inside it, and call "vscode.executeTypeDefinitionProvider"
    // or fallback to "vscode.executeDefinitionProvider".
    for (let lineNum = 0; lineNum < doc.lineCount; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;
        const idx = lineText.indexOf(typeName);
        if (idx !== -1) {
            // 1) Try type definition provider
            const typeLocations = (await vscode.commands.executeCommand(
                'vscode.executeTypeDefinitionProvider',
                doc.uri,
                new vscode.Position(lineNum, idx + 1)
            )) as vscode.Location[] | undefined;

            let defLoc = typeLocations && typeLocations[0];
            if (!defLoc) {
                // 2) Fallback: definition provider
                const defLocations = (await vscode.commands.executeCommand(
                    'vscode.executeDefinitionProvider',
                    doc.uri,
                    new vscode.Position(lineNum, idx + 1)
                )) as vscode.Location[] | undefined;
                defLoc = defLocations && defLocations[0];
            }

            if (defLoc) {
                const defDoc = await vscode.workspace.openTextDocument(defLoc.uri);
                const defSymbols = (await vscode.commands.executeCommand(
                    'vscode.executeDocumentSymbolProvider',
                    defDoc.uri
                )) as vscode.DocumentSymbol[] | undefined;

                if (!defSymbols) {
                    continue;
                }
                // We find the symbol that contains this range
                const symbol = symbolContainingRange(defSymbols, defLoc.range);
                if (!symbol) {
                    continue;
                }
                const text = defDoc.getText(symbol.range);
                return { uri: defDoc.uri, text };
            }
        }
    }
    return undefined;
}

/**
 * Finds the symbol that fully contains `targetRange`.
 */
function symbolContainingRange(
    symbols: vscode.DocumentSymbol[],
    targetRange: vscode.Range
): vscode.DocumentSymbol | undefined {
    for (const s of symbols) {
        if (s.range.contains(targetRange)) {
            const child = symbolContainingRange(s.children, targetRange);
            return child || s;
        }
    }
    return undefined;
}

/**
 * Gather package.json dependencies if present (for JS/TS).
 * For other languages, adapt to check e.g. requirements.txt, go.mod, etc.
 */
function getPackageJsonDependencies():
    | { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return undefined;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const pkgPath = path.join(rootPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return undefined;
    }

    try {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(content);
        return {
            dependencies: pkgJson.dependencies,
            devDependencies: pkgJson.devDependencies,
        };
    } catch (err) {
        return undefined;
    }
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
    if (!cmd) return undefined;

    try {
        const output = cp.execSync(cmd, { encoding: 'utf-8' }).trim();
        return output;
    } catch {
        return undefined;
    }
}

/**
 * Generate a file tree of the entire workspace (minus node_modules) and mark
 * any file in 'usedFiles' with an asterisk (*).
 */
async function generateFileTree(usedFiles: Set<string>): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return 'No workspace folder available.';
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    // For demo, gather all files except node_modules
    const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
    // Sort them so the tree is consistent
    uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    // Build a simple nested tree data structure
    interface TreeNode {
        name: string;
        fsPath: string;
        isDir: boolean;
        children?: TreeNode[];
    }

    const rootNode: TreeNode = {
        name: path.basename(rootPath) || rootPath,
        fsPath: rootPath,
        isDir: true,
        children: [],
    };

    function insertIntoTree(base: TreeNode, parts: string[]) {
        if (!parts.length) return;
        const segment = parts[0];
        let child = base.children?.find((c) => c.name === segment);
        if (!child) {
            const childPath = path.join(base.fsPath, segment);
            child = {
                name: segment,
                fsPath: childPath,
                isDir: fs.existsSync(childPath) && fs.statSync(childPath).isDirectory(),
                children: [],
            };
            base.children!.push(child);
        }
        insertIntoTree(child, parts.slice(1));
    }

    for (const fileUri of uris) {
        const relPath = path.relative(rootPath, fileUri.fsPath);
        const segments = relPath.split(path.sep);
        insertIntoTree(rootNode, segments);
    }

    // Print the tree with indentation, marking used files with '*'
    const lines: string[] = [];

    function printNode(node: TreeNode, indent: string) {
        const mark = usedFiles.has(node.fsPath) ? ' *' : '';
        const suffix = node.isDir ? '/' : '';
        lines.push(`${indent}${node.name}${mark}`);
        if (node.isDir && node.children) {
            // Sort directories first, then files
            node.children.sort((a, b) => {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            });
            for (const c of node.children) {
                printNode(c, indent + '  ');
            }
        }
    }

    printNode(rootNode, '');
    return lines.join('\n');
}
