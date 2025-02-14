import { fileTreeToString } from "../toString";
import { LlmPrompt, RaydocContext } from "../types";

export enum ModelType {
    SmallLlm = "small",
    MediumLlm = "medium",
    LargeLlm = "large",
}

export abstract class Llm {
    apiKey!: string;
    baseUrl!: string;
    constructor() { }
    abstract query(messages: LlmPrompt[], modelType: ModelType): void
}

export function codebaseSummaryPrompt(context: RaydocContext): LlmPrompt[] {
    const prompts: LlmPrompt[] = [];

    prompts.push({
        role: "system",
        content: "You are going to receive a summary of the types, functions, packages, and files in the codebase. Your role is to identify what the purpose of the codebase is and write a summary of it. This summary will be used as the start of the technical documentation for the project."
    });

    const userPrompt: LlmPrompt = {
        role: "user",
        content: "This is the contents of my codebase:"
    };

    if (context.packages) {
        userPrompt.content += "\n\nPackages:\n";
        for (const [name, version] of Object.entries(context.packages)) {
            userPrompt.content += `${name}: ${version}\n`;
        }
    }

    if (context.referencedFunctions) {
        userPrompt.content += "\nFunctions:\n";
        for (const fn of context.referencedFunctions) {
            userPrompt.content += `${fn.functionName} in ${fn.filename}\n`;
        }
    }

    if (context.typeDefns && context.typeDefns.length > 0) {
        userPrompt.content += "\nType Definitions:\n";
        for (const typeDefn of context.typeDefns) {
            userPrompt.content += `${typeDefn.functionName} in ${typeDefn.filename}\n`;
        }
    }

    if (context.fileTree) {
        userPrompt.content += "\nFiles:\n";
        userPrompt.content += fileTreeToString(context.fileTree, '');
    }

    prompts.push(userPrompt);

    return prompts;
}