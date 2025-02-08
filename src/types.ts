export type RaydocContext = {
    filepath: string;
    line: number;
    errorMessage?: string;
    languageId: string;
    runtime?: string;
    runtimeVersion?: string;
    runtimePath?: string;
    packages?: { [key: string]: string }[];
    functionDefns?: FunctionDefinition[];
    typeDefns?: TypeDefinition[];
    fileTree: RootNode;
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

export type RootNode = {
    name: string;
    children?: Node[];
}

export type Node = {
    name: string;
    children?: Node[];
}