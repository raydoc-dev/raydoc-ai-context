export type RaydocContext = {
    filepath: string;
    line: number;
    errorMessage?: string;
    languageId: string;
    runtime?: string;
    runtimeVersion?: string;
    runtimePath?: string;
    packages?: Record<string, string>;
    functionDefn?: FunctionDefinition;
    typeDefns?: TypeDefinition[];
    fileTree?: Node;
}

export type FunctionDefinition = {
    filename: string;
    functionText: string;
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
