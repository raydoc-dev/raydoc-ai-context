import * as vscode from 'vscode';
import { Node } from './types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Generate a file tree of the entire workspace (minus node_modules) and mark
 * any file in 'usedFiles' with an asterisk (*).
 */
export async function generateFileTree(usedFiles: Set<string>): Promise<Node | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return undefined;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    // For demo, gather all files except node_modules
    const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/lib/**,**/bin/**,**/dist/**,**/build/**,**/pyvenv.cfg,**/isympy.1}', 200);
    // Sort them so the tree is consistent
    uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    const rootNode: Node = {
        name: path.basename(rootPath) || rootPath,
        fsPath: rootPath,
        isDir: true,
        children: [],
    };

    function insertIntoTree(base: Node, parts: string[]) {
        if (!parts.length) { return; }
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

    return rootNode;
}

export function printNode(usedFiles: Set<string>, node: Node, indent: string, lines: string[]) {
    const mark = usedFiles.has(node.fsPath) ? ' *' : '';
    lines.push(`${indent}${node.name}${mark}`);
    if (node.isDir && node.children) {
        // Sort directories first, then files
        node.children.sort((a, b) => {
            if (a.isDir && !b.isDir) {
                return -1;
            }
            if (!a.isDir && b.isDir) {
                return 1;
            }
            return a.name.localeCompare(b.name);
        });
        for (const c of node.children) {
            printNode(usedFiles, c, indent + '  ', lines);
        }
    }
}
