import * as vscode from 'vscode';
import { Node, RaydocContext } from "./types";

export function contextToString(context: RaydocContext): string {
    const config = vscode.workspace.getConfiguration('raydoc-context.output-config');
    const includeEnvironment = config.get<boolean>('environment', true);
    const includeRuntimeVersion = config.get<boolean>('runtime-version', true);
    const includeFocusedLines = config.get<boolean>('focused-lines', true);
    const includePackages = config.get<boolean>('packages', true);
    const includeFileTree = config.get<boolean>('file-tree', false);
    const includeFunctionDefn = config.get<boolean>('function-definition', true);
    const includeTypeDefns = config.get<boolean>('type-definitions', true);
    const includeReferencedFunctions = config.get<boolean>('referenced-functions', false);

    var output: string = '';

    if (context.errorMessage) {
        output = "=== Error ===\n";
        output += `Error Message: ${context.errorMessage}\n`;
        output += "\n";
    }

    if (includeFocusedLines) {
        output += "=== Focus Lines ===\n";

        if (context.immediateContextLines) {
            output += context.immediateContextLines;
            output += "\n\n";
        }
    }

    if (context.filepath || context.line) {
        output += "=== Context ===\n";
    }

    if (context.filepath) {
        output += `File: ${context.filepath}\n`;
    }

    if (context.line) {
        output += `Line: ${context.line + 1}\n`; // Convert to 1-based line number for readability
    }

    if (includeEnvironment) {
        output += "\n=== Environment ===\n";

        if (context.languageId) {
            output += `Language: ${context.languageId}\n`;
        }

        if (context.runtime) {
            output += `Version: ${context.runtimeVersion}\n`;
        }
    }

    if (includePackages && context.packages) {
        output += "\n=== Packages ===\n";
        for (const [name, version] of Object.entries(context.packages)) {
            output += `${name}: ${version}\n`;
        }
    }

    if (includeFunctionDefn && context.functionDefn) {
        output += `\n=== Enclosing Function (${context.functionDefn.filename}) ===\n`;
        output += context.functionDefn.functionText;
    }

    if (includeTypeDefns && context.typeDefns && context.typeDefns.length > 0) {
        output += "\n\n=== Type Definitions ===\n";
        for (const typeDefn of context.typeDefns) {
            output += `--- Custom Type: "${typeDefn.functionName}" (${typeDefn.filename}) ---\n`;
            output += typeDefn.functionText;
            output += '\n\n';
        }
    }

    if (includeFileTree && context.fileTree) {
        output += "\n=== Workspace File Tree ===\n";
        output += fileTreeToString(context.fileTree, '');
    }

    if (includeReferencedFunctions && context.referencedFunctions && context.referencedFunctions.length > 0) {
        output += "\n=== Referenced Functions ===\n";
        for (const refFunc of context.referencedFunctions) {
            output += `--- Referenced Function: "${refFunc.functionName}" (${refFunc.filename}) ---\n`;
            output += refFunc.functionText;
            output += '\n\n';
        }
    }

    return output;
}

export function contextToStringLlm(context: RaydocContext): string {
    const config = vscode.workspace.getConfiguration('raydoc-context.output-config');
    const includeFocusedLines = config.get<boolean>('focused-lines', true);
    
    let output = "";
    if (context.errorMessage) {
        output = "=== Error ===\n";
        output += `Error Message: ${context.errorMessage}\n`;
        output += "\n";
    }

    if (includeFocusedLines) {
        output += "=== Focus Lines ===\n";

        if (context.immediateContextLines) {
            output += context.immediateContextLines;
            output += "\n\n";
        }
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
