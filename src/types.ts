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
    typeDefns?: FunctionDefinition[];
    fileTree?: Node;
}

export type FunctionDefinition = {
    functionName: string;
    filename: string;
    functionText: string;
    functionSymbol: DocumentSymbol;
    startLine: number;
    endLine: number;
}

export type Node = {
    name: string;
    isDir: boolean;
    fsPath: string;
    children?: Node[];
}

export type LlmPrompt = {
    role: string;
    content: string;
}