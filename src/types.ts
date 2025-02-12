import { DocumentSymbol } from "vscode";

export type RaydocContext = {
    filepath: string;
    line: number;
    immediateContextLines?: string;
    errorMessage?: string;
    languageId: string;
    runtime?: string;
    runtimeVersion?: string;
    runtimePath?: string;
    packages?: Record<string, string>;
    functionDefn?: FunctionDefinition;
    referencedFunctions?: FunctionDefinition[];
    typeDefns?: TypeDefinition[];
    fileTree?: Node;
}

export type FunctionDefinition = {
    filename: string;
    functionText: string;
    functionSymbol: DocumentSymbol;
    startLine: number;
    endLine: number;
}

export type TypeDefinition = {
    typeName: string;
    filename: string;
    typeText: string;
}

export type Node = {
    name: string;
    isDir: boolean;
    fsPath: string;
    children?: Node[];
}
