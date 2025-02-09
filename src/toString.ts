import { Node, RaydocContext } from "./types";

export function contextToString(context: RaydocContext): string {
    var output: string = '';
    if (context.errorMessage) {
        output = "=== Error Context ===\n";
        output += `File: ${context.filepath}\n`;
        output += `Line: ${context.line}\n`;
        output += `Error Message: ${context.errorMessage}\n`;
    }

    if (context.packages) {
        output += "\n=== Packages ===\n";
        for (const [name, version] of Object.entries(context.packages)) {
            output += `${name}: ${version}\n`;
        }
    }

    if (context.functionDefn) {
        output += `\n=== Enclosing Function (${context.functionDefn.filename}) ===\n`;
        output += context.functionDefn.functionText;
    }

    if (context.typeDefns) {
        output += "\n=== Type Definitions ===\n";
        for (const typeDefn of context.typeDefns) {
            output += `--- Custom Type: "${typeDefn.typeName}" (${typeDefn.filename}) ---\n`;
            output += typeDefn.typeText;
            output += '\n\n';
        }
    }

    if (context.fileTree) {
        output += "\n=== Workspace File Tree ===\n";
        output += fileTreeToString(context.fileTree, '');
    }

    return output;
}

function fileTreeToString(node: Node, indent: string): string {
    let output = `${indent}${node.name}${node.isDir ? '/' : ''}\n`;
    if (node.children) {
        for (const child of node.children) {
            output += fileTreeToString(child, indent + '    ');
        }
    }
    return output;
}

// async function generateFileTree(usedFiles: Set<string>): Promise<string> {
//     const workspaceFolders = vscode.workspace.workspaceFolders;
//     if (!workspaceFolders?.length) {
//         return 'No workspace folder available.';
//     }
//     const rootPath = workspaceFolders[0].uri.fsPath;

//     // For demo, gather all files except node_modules
//     const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
//     // Sort them so the tree is consistent
//     uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

//     // Build a simple nested tree data structure
//     interface TreeNode {
//         name: string;
//         fsPath: string;
//         isDir: boolean;
//         children?: TreeNode[];
//     }

//     const rootNode: TreeNode = {
//         name: path.basename(rootPath) || rootPath,
//         fsPath: rootPath,
//         isDir: true,
//         children: [],
//     };

//     function insertIntoTree(base: TreeNode, parts: string[]) {
//         if (!parts.length) return;
//         const segment = parts[0];
//         let child = base.children?.find((c) => c.name === segment);
//         if (!child) {
//             const childPath = path.join(base.fsPath, segment);
//             child = {
//                 name: segment,
//                 fsPath: childPath,
//                 isDir: fs.existsSync(childPath) && fs.statSync(childPath).isDirectory(),
//                 children: [],
//             };
//             base.children!.push(child);
//         }
//         insertIntoTree(child, parts.slice(1));
//     }

//     for (const fileUri of uris) {
//         const relPath = path.relative(rootPath, fileUri.fsPath);
//         const segments = relPath.split(path.sep);
//         insertIntoTree(rootNode, segments);
//     }

//     // Print the tree with indentation, marking used files with '*'
//     const lines: string[] = [];

//     function printNode(node: TreeNode, indent: string) {
//         const mark = usedFiles.has(node.fsPath) ? ' *' : '';
//         const suffix = node.isDir ? '/' : '';
//         lines.push(`${indent}${node.name}${mark}`);
//         if (node.isDir && node.children) {
//             // Sort directories first, then files
//             node.children.sort((a, b) => {
//                 if (a.isDir && !b.isDir) return -1;
//                 if (!a.isDir && b.isDir) return 1;
//                 return a.name.localeCompare(b.name);
//             });
//             for (const c of node.children) {
//                 printNode(c, indent + '  ');
//             }
//         }
//     }

//     printNode(rootNode, '');
//     return lines.join('\n');
// }