import { Llm, ModelType } from "./llm";
import { LlmPrompt } from "../types";

type FireworksRequest = {
    model: string
    maxTokens: number
    topP: number
    topK: number
    presencePenalty: number
    frequencyPenalty: number
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
    finishReason: string
}

type UsageStats = {
    promptTokens: number
    completionTokens: number
    totalTokens: number
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
            maxTokens: 16384,
            topP: 1,
            topK: 40,
            presencePenalty: 0,
            frequencyPenalty: 0,
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as FireworksResponse;

        if (data.choices.length === 0) {
            throw new Error("No choices in response");
        }

        return data.choices[0].message.content;
    }
}
