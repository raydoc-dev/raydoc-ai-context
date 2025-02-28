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

    let output = '';

    // ========== Error ==========
    if (context.errorMessage) {
        output = "=== Error ===\n";
        output += `Error Message: ${context.errorMessage}\n\n`;
    }

    // ========== Focused Lines ==========
    if (includeFocusedLines) {
        output += "=== Focus Lines ===\n";
        if (context.immediateContextLines) {
            output += context.immediateContextLines;
            output += "\n\n";
        }
    }

    // ========== Basic Context (File & Line) ==========
    if (context.filepath || typeof context.line === 'number') {
        output += "=== Context ===\n";
    }

    if (context.filepath) {
        output += `File: ${context.filepath}\n`;
    }

    // Note: context.line is the first line of the user’s selection in gatherContext
    if (typeof context.line === 'number') {
        output += `Line: ${context.line + 1}\n`; // Convert to 1-based for readability
    }

    // ========== Environment (Language, Runtime) ==========
    if (includeEnvironment) {
        output += "\n=== Environment ===\n";
        if (context.languageId) {
            output += `Language: ${context.languageId}\n`;
        }
        if (includeRuntimeVersion && context.runtimeVersion) {
            output += `Version: ${context.runtimeVersion}\n`;
        }
    }

    // ========== Packages ==========
    if (includePackages && context.packages) {
        output += "\n=== Packages ===\n";
        for (const [name, version] of Object.entries(context.packages)) {
            output += `${name}: ${version}\n`;
        }
    }

    // ========== Main Function(s) in Selection ==========
    // (previously context.functionDefn, now an array context.functionDefns)
    if (includeFunctionDefn && context.functionDefns && context.functionDefns.length > 0) {
        // If you prefer a different heading when there's more than one function:
        if (context.functionDefns.length > 1) {
            output += `\n=== Main Functions in Selection ===\n`;
        } else {
            output += `\n=== Enclosing Function (${context.functionDefns[0].filename}) ===\n`;
        }

        for (const mainFn of context.functionDefns) {
            output += `--- Main Function: "${mainFn.functionName}" (${mainFn.filename}) ---\n`;
            output += mainFn.functionText;
            output += '\n\n';
        }
    }

    // ========== Type Definitions ==========
    if (includeTypeDefns && context.typeDefns && context.typeDefns.length > 0) {
        output += "\n=== Type Definitions ===\n";
        for (const typeDefn of context.typeDefns) {
            output += `--- Custom Type: "${typeDefn.functionName}" (${typeDefn.filename}) ---\n`;
            output += typeDefn.functionText;
            output += '\n\n';
        }
    }

    // ========== Workspace File Tree ==========
    if (includeFileTree && context.fileTree) {
        output += "\n=== Workspace File Tree ===\n";
        output += fileTreeToString(context.fileTree, '');
    }

    // ========== Referenced Functions ==========
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

    let output = '';

    // If there's an error message, show it
    if (context.errorMessage) {
        output += "=== Error ===\n";
        output += `Error Message: ${context.errorMessage}\n\n`;
    }

    // If configured, show the focused lines (the user’s selection + some surrounding lines)
    if (includeFocusedLines && context.immediateContextLines) {
        output += "=== Focus Lines ===\n";
        output += context.immediateContextLines;
        output += "\n\n";
    }

    return output;
}

// Helper to recursively print the file tree
function fileTreeToString(node: Node, indent: string): string {
    let output = `${indent}${node.name}${node.isDir ? '/' : ''}\n`;
    if (node.children) {
        for (const child of node.children) {
            output += fileTreeToString(child, indent + '    ');
        }
    }
    return output;
}
