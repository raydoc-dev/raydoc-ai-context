import { Llm, ModelType } from "./llm";
import { LlmPrompt } from "../types";

type FireworksRequest = {
    model: string
    max_tokens: number
    top_p: number
    top_k: number
    presence_penalty: number
    frequency_penalty: number
    temperature: number
    messages: LlmPrompt[]
}

// FireworksResponse represents the structure of a response from the Fireworks API.
type FireworksResponse = {
    id: string
    object: string
    created: number
    model: string
    choices: Choice[]
    usage: UsageStats
}

type Choice = {
    index: number
    message: LlmPrompt
    finish_reason: string
}

type UsageStats = {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
}

export class FireworksClient extends Llm {
    constructor() {
        super();
        this.apiKey = process.env.FIREWORKS_API_KEY || '';
        this.baseUrl = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai';

        if (this.apiKey === '') {
            throw new Error("FIREWORKS_API_KEY environment variable not set.");
        }
    }

    async query(messages: LlmPrompt[], modelType: ModelType): Promise<string> {

        let model = "";
        switch (modelType) {
            case ModelType.SmallLlm:
                model = "accounts/fireworks/models/llama-v3p2-3b-instruct";
                break;
            case ModelType.MediumLlm:
                model = "accounts/fireworks/models/llama-v3p3-70b-instruct";
                break;
            case ModelType.LargeLlm:
                model = "accounts/fireworks/models/llama-v3p3-70b-instruct";
                break;
            default:
                throw new Error("Model type not supported");
        }

        let requestPayload: FireworksRequest = {
            model: model,
            max_tokens: 16384,
            top_p: 1,
            top_k: 40,
            presence_penalty: 0,
            frequency_penalty: 0,
            temperature: 0.05,
            messages: messages,
        };

        const response = await fetch(this.baseUrl + "/inference/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}. ${await response.text()}`);
        }

        const data = await response.json() as FireworksResponse;

        if (data.choices.length === 0) {
            throw new Error("No choices in response");
        }

        return data.choices[0].message.content;
    }
}
