import { Llm, ModelType } from './llm';
import { LlmPrompt } from '../types';

export class RaydocClient extends Llm {
    constructor() {
        super();
        this.apiKey = process.env.RAYDOC_API_KEY || '';
        this.baseUrl = process.env.RAYDOC_BASE_URL || 'https://api.raydoc.dev';

        if (this.apiKey === '') {
            throw new Error("RAYDOC_API_KEY environment variable not set.");
        }
    }

    query(messages: LlmPrompt[], modelType: ModelType): void {
        throw new Error("Method not implemented.");
    }
}
