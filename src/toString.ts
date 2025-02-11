import { Node, RaydocContext } from "./types";

export function contextToString(context: RaydocContext): string {
    var output: string = '';

    if (context.errorMessage) {
        output = "=== Error ===\n";
        output += `Error Message: ${context.errorMessage}\n`;
        output += "\n";
    }

    output += "=== Focus Lines ===\n";

    if (context.immediateContextLines) {
        output += context.immediateContextLines;
        output += "\n\n";
    }

    output += "=== Context ===\n";

    if (context.filepath) {
        output += `File: ${context.filepath}\n`;
    }

    if (context.line) {
        output += `Line: ${context.line + 1}\n`; // Convert to 1-based line number for readability
    }

    output += "\n=== Environment ===\n";

    if (context.languageId) {
        output += `Language: ${context.languageId}\n`;
    }

    if (context.runtime) {
        output += `Version: ${context.runtimeVersion}\n`;
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
        output += "\n\n=== Type Definitions ===\n";
        for (const typeDefn of context.typeDefns) {
            output += `--- Custom Type: "${typeDefn.typeName}" (${typeDefn.filename}) ---\n`;
            output += typeDefn.typeText;
            output += '\n\n';
        }
    }

    // if (context.fileTree) {
    //     output += "\n=== Workspace File Tree ===\n";
    //     output += fileTreeToString(context.fileTree, '');
    // }

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
