import { Llm, ModelType } from './llm';
import { LlmPrompt } from '../types';

export class OpenAiClient extends Llm {
    constructor() {
        super();
        this.apiKey = process.env.OPENAI_API_KEY || '';

        if (this.apiKey === '') {
            throw new Error("OPENAI_API_KEY environment variable not set.");
        }
    }

    query(messages: LlmPrompt[], modelType: ModelType): void {
        throw new Error("Method not implemented.");
    }
}
