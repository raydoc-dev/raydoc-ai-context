import { GenerativeModel, GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Define interface for our structured output
interface DescriptionOutput {
  fifty_char_description: string;
  in_depth_description: string;
}

export class Gemini {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    async generateText(prompt: string): Promise<string> {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
    }

    async generateStructuredOutput(prompt: string): Promise<DescriptionOutput> {
        // Create a model instance with structured output configuration
        const structuredModel = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        fifty_char_description: { type: SchemaType.STRING },
                        in_depth_description: { type: SchemaType.STRING }
                    },
                    required: ["fifty_char_description", "in_depth_description"]
                }
            }
        });

        // Generate content with the configured model
        const result = await structuredModel.generateContent(prompt);
        
        // Parse the JSON response
        const jsonResponse = JSON.parse(result.response.text());
        return jsonResponse as DescriptionOutput;
    }
}