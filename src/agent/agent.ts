import { FileCombiner } from "./file-combiner";
import { Gemini } from "./gemini";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class Agent {
    private gemini: Gemini;
    private task: string;
    
    // Class variables to store important information between runs
    private codebaseDescription: { fiftyCharDescription: string, inDepthDescription: string } | null = null;
    private problemFitsIntoCodebase: string | null = null;
    private problemsWithCode: string | null = null;
    private problemFitsWhere: string | null = null;
    private questionsAndAssumptions: string | null = null;

    constructor() {
        this.gemini = this.setUpGemini();

        // Example "task" describing the user request.
        // In practice, this can be replaced or augmented by any user-specified feature or issue.
        this.task = `
I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.

My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality.

I want to make this feature as easy to use as possible.
        `;
    }

    setUpGemini(): Gemini {
        const config = vscode.workspace.getConfiguration('raydoc-context');
        const apiKey = config.get('geminiApiKey') as string;
        return new Gemini(apiKey);
    }

    async run() {
        // Step 1: Gather a high-level (50 characters) and detailed description of the codebase
        this.codebaseDescription = await this.getCodebaseDescription();

        // Step 2: Analyze how the user's desired feature logically fits within the codebase
        this.problemFitsIntoCodebase = await this.howProblemFitsIntoCodebase(
            this.codebaseDescription.fiftyCharDescription, 
            this.codebaseDescription.inDepthDescription, 
            this.task
        );
        
        // Step 3: Cross-check the preliminary analysis with the actual code
        this.problemsWithCode = await this.howProblemsWithCode(
            this.codebaseDescription.fiftyCharDescription, 
            this.codebaseDescription.inDepthDescription, 
            this.task, 
            this.problemFitsIntoCodebase
        );
        
        // Step 4: Identify the specific files where the feature might fit or need modification
        this.problemFitsWhere = await this.getProblemFitsWhere(
            this.codebaseDescription.fiftyCharDescription, 
            this.codebaseDescription.inDepthDescription, 
            this.task, 
            this.problemFitsIntoCodebase, 
            this.problemsWithCode
        );
        
        // Step 5: Generate a curated list of questions and assumptions, focusing only on what's essential
        this.questionsAndAssumptions = await this.generateQuestionsAndAssumptions(
            this.codebaseDescription.fiftyCharDescription, 
            this.codebaseDescription.inDepthDescription, 
            this.task, 
            this.problemFitsIntoCodebase, 
            this.problemsWithCode, 
            this.problemFitsWhere
        );
        
        // Finally, save those questions to a file for the user to answer
        await this.saveQuestionsToFile(this.questionsAndAssumptions);
        
        console.log("Questions and Assumptions saved to raydoc/questions.md");
    }
    
    async run2() {
        console.log("Running the second part of the agent after receiving user answers...");

        try {
            // Read answers from the questions.md file
            const answersContent = await this.readAnswersFromFile();
            
            if (!answersContent) {
                vscode.window.showErrorMessage("Could not find or read the answers file. Please make sure you've answered the questions in raydoc/questions.md.");
                return;
            }
            
            console.log("Successfully read answers from file.");
            
            // Ensure we have the info from the first run. If not, re-run the relevant methods.
            if (!this.codebaseDescription || !this.problemFitsIntoCodebase || 
                !this.problemsWithCode || !this.problemFitsWhere || !this.questionsAndAssumptions) {
                console.log("Missing stored information from first run, retrieving again...");
                
                this.codebaseDescription = await this.getCodebaseDescription();
                this.problemFitsIntoCodebase = await this.howProblemFitsIntoCodebase(
                    this.codebaseDescription.fiftyCharDescription, 
                    this.codebaseDescription.inDepthDescription, 
                    this.task
                );
                this.problemsWithCode = await this.howProblemsWithCode(
                    this.codebaseDescription.fiftyCharDescription, 
                    this.codebaseDescription.inDepthDescription, 
                    this.task, 
                    this.problemFitsIntoCodebase
                );
                this.problemFitsWhere = await this.getProblemFitsWhere(
                    this.codebaseDescription.fiftyCharDescription, 
                    this.codebaseDescription.inDepthDescription, 
                    this.task, 
                    this.problemFitsIntoCodebase, 
                    this.problemsWithCode
                );
            }
            
            // Process the user's answers together with the stored context to generate a final implementation plan
            await this.processAnswers(answersContent);
            
        } catch (error) {
            console.error("Error in run2:", error);
            vscode.window.showErrorMessage(`Error processing answers: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    async run3() {
        console.log("Running the third part of the agent to create a design document...");

        try {
            // Read the requirements from the requirements.md file
            const requirementsContent = await this.readRequirementsFromFile();
            
            if (!requirementsContent) {
                vscode.window.showErrorMessage("Could not find or read the requirements file. Please make sure you've generated requirements in raydoc/requirements.md.");
                return;
            }
            
            console.log("Successfully read requirements from file.");
            
            // Ensure we have the info from the previous runs. If not, show an error.
            if (!this.codebaseDescription || !this.problemFitsIntoCodebase || 
                !this.problemsWithCode || !this.problemFitsWhere) {
                vscode.window.showErrorMessage("Missing information from previous analysis. Please run the agent from the beginning.");
                return;
            }
            
            // Generate a detailed design document based on the requirements
            await this.generateDesignDocument(requirementsContent);
            
        } catch (error) {
            console.error("Error in run3:", error);
            vscode.window.showErrorMessage(`Error generating design document: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    async saveQuestionsToFile(questionsAndAssumptions: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.error("No workspace folders found");
            return;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const raydocDir = path.join(rootPath, 'raydoc');
        const questionsFilePath = path.join(raydocDir, 'questions.md');
        
        // Create raydoc directory if it doesn't exist
        try {
            if (!fs.existsSync(raydocDir)) {
                fs.mkdirSync(raydocDir, { recursive: true });
            }
            
            // Create the content for the questions file - using raw LLM output
            const fileContent = `# Questions for Variable Upstream Tracking Feature

## Instructions
Please review the questions and assumptions below. Once you've reviewed and answered the questions, run the "Submit Answers for Raydoc Agent" command.

${questionsAndAssumptions}
`;
            
            fs.writeFileSync(questionsFilePath, fileContent, 'utf8');
            
            // Open the file in the editor for convenience
            const fileUri = vscode.Uri.file(questionsFilePath);
            await vscode.window.showTextDocument(fileUri);
            
        } catch (error) {
            console.error("Error saving questions to file:", error);
        }
    }

    async readAnswersFromFile(): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.error("No workspace folders found");
            return null;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const raydocDir = path.join(rootPath, 'raydoc');
        const questionsFilePath = path.join(raydocDir, 'questions.md');
        
        if (!fs.existsSync(questionsFilePath)) {
            console.error("questions.md file not found");
            return null;
        }
        
        try {
            const fileContent = fs.readFileSync(questionsFilePath, 'utf8');
            return fileContent;
        } catch (error) {
            console.error("Error reading questions.md file:", error);
            return null;
        }
    }
    
    async processAnswers(answersContent: string): Promise<void> {
        console.log("Processing answers to generate requirements...");
        
        // Step 1: Generate high-level requirements based on user input and analyses
        console.log("Step 1: Generating high-level requirements...");
        const highLevelRequirementsPrompt = `
I will give you a description of a codebase, a user's feature request, and their answers to clarifying questions.

Your task is to generate a set of HIGH-LEVEL REQUIREMENTS for this feature. These should be broad, overarching requirements that capture the essence of what the feature needs to accomplish.

For each requirement:
1. State the requirement clearly and concisely
2. Provide a justification that directly traces back to either:
   - The user's original feature request
   - The user's answers to questions
   - A necessary technical consideration for implementing what the user explicitly requested

Short Codebase Description:
${this.codebaseDescription?.fiftyCharDescription}

---
Detailed Codebase Description:
${this.codebaseDescription?.inDepthDescription}

---
User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
Format each requirement as:
REQ-H1: [High-level requirement text]
Justification: [Clear explanation of why this requirement exists, with direct reference to user input]
`;
        
        const highLevelRequirements = await this.gemini.generateText(highLevelRequirementsPrompt);
        console.log("High-level requirements generated");
        
        // Step 2: Review and refine high-level requirements
        console.log("Step 2: Reviewing and refining high-level requirements...");
        const reviewHighLevelRequirementsPrompt = `
Review the following HIGH-LEVEL REQUIREMENTS for a new feature. Your task is to critically evaluate each requirement against these criteria:

1. Is it truly necessary based on the user's request?
2. Is it directly traceable to something the user explicitly stated or clearly implied?
3. Is it free of implementation details (which belong in lower-level requirements)?
4. Is it clear, unambiguous, and focused on a single concern?
5. Is there any redundancy or overlap with other requirements?

For each requirement that doesn't meet these criteria, suggest how to improve, combine, or eliminate it.

User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
High-Level Requirements to Review:
${highLevelRequirements}
`;
        
        const refinedHighLevelRequirements = await this.gemini.generateText(reviewHighLevelRequirementsPrompt);
        console.log("High-level requirements refined");
        
        // Step 3: Generate medium-level requirements
        console.log("Step 3: Generating medium-level requirements...");
        const mediumLevelRequirementsPrompt = `
Based on the refined HIGH-LEVEL REQUIREMENTS, now generate MEDIUM-LEVEL REQUIREMENTS that break down each high-level requirement into more specific components.

Medium-level requirements should:
1. Be more specific than high-level requirements but not get into technical implementation details
2. Focus on functional behaviors and user interactions
3. Each trace back to at least one high-level requirement
4. Still be directly justifiable from the user's input

User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
Refined High-Level Requirements:
${refinedHighLevelRequirements}

---
Format each medium-level requirement as:
REQ-M1: [Medium-level requirement text]
Parent: [Reference to parent high-level requirement(s)]
Justification: [Clear explanation of why this requirement exists, with direct reference to user input]
`;
        
        const mediumLevelRequirements = await this.gemini.generateText(mediumLevelRequirementsPrompt);
        console.log("Medium-level requirements generated");
        
        // Step 4: Review and refine medium-level requirements
        console.log("Step 4: Reviewing and refining medium-level requirements...");
        const reviewMediumLevelRequirementsPrompt = `
Review the following MEDIUM-LEVEL REQUIREMENTS for a new feature. Your task is to critically evaluate each requirement against these criteria:

1. Does it properly break down its parent high-level requirement(s)?
2. Is it still directly traceable to the user's input?
3. Is it free of low-level implementation details?
4. Is it clear, unambiguous, and focused?
5. Is there any redundancy or overlap with other requirements?
6. Does it introduce any functionality not justified by the user's request?

For each requirement that doesn't meet these criteria, suggest how to improve, combine, or eliminate it.

User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
Refined High-Level Requirements:
${refinedHighLevelRequirements}

---
Medium-Level Requirements to Review:
${mediumLevelRequirements}
`;
        
        const refinedMediumLevelRequirements = await this.gemini.generateText(reviewMediumLevelRequirementsPrompt);
        console.log("Medium-level requirements refined");
        
        // Step 5: Generate low-level requirements
        console.log("Step 5: Generating low-level requirements...");
        const lowLevelRequirementsPrompt = `
Based on the refined MEDIUM-LEVEL REQUIREMENTS, now generate LOW-LEVEL REQUIREMENTS that provide specific, detailed requirements for implementation.

Low-level requirements should:
1. Be specific and detailed enough to guide implementation
2. Include technical considerations where necessary
3. Each trace back to at least one medium-level requirement
4. Still be justifiable based on the user's input, even if indirectly
5. Consider the existing codebase patterns and structure

User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
Refined High-Level Requirements:
${refinedHighLevelRequirements}

---
Refined Medium-Level Requirements:
${refinedMediumLevelRequirements}

---
Codebase Analysis (for context on technical patterns):
${this.problemFitsWhere}

---
Format each low-level requirement as:
REQ-L1: [Low-level requirement text]
Parent: [Reference to parent medium-level requirement(s)]
Justification: [Clear explanation of why this requirement exists, with reference to user input or necessary technical considerations]
`;
        
        const lowLevelRequirements = await this.gemini.generateText(lowLevelRequirementsPrompt);
        console.log("Low-level requirements generated");
        
        // Step 6: Review and refine low-level requirements
        console.log("Step 6: Reviewing and refining low-level requirements...");
        const reviewLowLevelRequirementsPrompt = `
Review the following LOW-LEVEL REQUIREMENTS for a new feature. Your task is to critically evaluate each requirement against these criteria:

1. Does it properly implement its parent medium-level requirement(s)?
2. Can it still be traced back to the user's original request or answers?
3. Is it specific enough to guide implementation without being overly prescriptive?
4. Is it clear, unambiguous, and focused?
5. Is there any redundancy or overlap with other requirements?
6. Does it introduce any functionality not justified by the user's request?
7. Is it consistent with the existing codebase patterns?

For each requirement that doesn't meet these criteria, suggest how to improve, combine, or eliminate it.

User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
Refined High-Level Requirements:
${refinedHighLevelRequirements}

---
Refined Medium-Level Requirements:
${refinedMediumLevelRequirements}

---
Low-Level Requirements to Review:
${lowLevelRequirements}
`;
        
        const refinedLowLevelRequirements = await this.gemini.generateText(reviewLowLevelRequirementsPrompt);
        console.log("Low-level requirements refined");
        
        // Step 7: Final simplification and traceability check
        console.log("Step 7: Performing final simplification and traceability check...");
        const finalRequirementsPrompt = `
You have generated and refined requirements at three levels: high, medium, and low. Now perform a final review to:

1. Eliminate any remaining redundancy across all levels
2. Ensure every requirement can be traced back to the user's input
3. Verify that no unnecessary requirements have been introduced
4. Check that the requirements are as simple as possible while still capturing the user's needs

User's Original Feature Request:
${this.task}

---
User's Answers to Questions:
${answersContent}

---
Refined High-Level Requirements:
${refinedHighLevelRequirements}

---
Refined Medium-Level Requirements:
${refinedMediumLevelRequirements}

---
Refined Low-Level Requirements:
${refinedLowLevelRequirements}

---
Produce a final, simplified set of requirements with clear traceability to user input. Format as:

# High-Level Requirements
[List of high-level requirements with justifications]

# Medium-Level Requirements
[List of medium-level requirements with parent references and justifications]

# Low-Level Requirements
[List of low-level requirements with parent references and justifications]

# Traceability Matrix
[A simple matrix showing how requirements trace back to specific user statements]
`;
        
        const finalRequirements = await this.gemini.generateText(finalRequirementsPrompt);
        console.log("Final requirements document generated");
        
        // Save the requirements to a file
        await this.saveRequirementsToFile(finalRequirements);
        
        vscode.window.showInformationMessage("Requirements document generated and saved to raydoc/requirements.md");
    }
    
    async saveRequirementsToFile(requirements: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.error("No workspace folders found");
            return;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const raydocDir = path.join(rootPath, 'raydoc');
        const requirementsFilePath = path.join(raydocDir, 'requirements.md');
        
        try {
            if (!fs.existsSync(raydocDir)) {
                fs.mkdirSync(raydocDir, { recursive: true });
            }
            
            const fileContent = `# Requirements Document for Variable Upstream Tracking Feature

${requirements}
`;
            
            fs.writeFileSync(requirementsFilePath, fileContent, 'utf8');
            
            const fileUri = vscode.Uri.file(requirementsFilePath);
            await vscode.window.showTextDocument(fileUri);
            
        } catch (error) {
            console.error("Error saving requirements to file:", error);
        }
    }

    /**
     * Generates a short and a long description of the codebase by combining
     * the entire codebase and then prompting Gemini for:
     *   1) A concise (50 chars) summary
     *   2) A more detailed descriptive overview
     */
    async getCodebaseDescription(): Promise<{fiftyCharDescription: string, inDepthDescription: string}> {
        const combinedContent = this.getCombinedCodebaseContent();

        // Prompt for 50-char summary
        let fiftyCharPrompt = `
You are given the entire codebase below. 
Please provide a concise (about 50 characters) overall summary of the primary purpose or functionality of the codebase.
Focus on the core objective or solution it provides, not the details of how.
        
Codebase:
${combinedContent}
        `;
        const geminiFiftyCharResponse = await this.gemini.generateText(fiftyCharPrompt);

        // Prompt for in-depth description
        let inDepthPrompt = `
You are given the entire codebase below. 
Please provide a detailed overview of its purpose, main features, architecture, and any notable design patterns or technologies used.
Emphasize how different parts of the codebase work together to achieve its goals.

Codebase:
${combinedContent}
        `;
        const geminiInDepthResponse = await this.gemini.generateText(inDepthPrompt);

        return {
            fiftyCharDescription: geminiFiftyCharResponse.trim(),
            inDepthDescription: geminiInDepthResponse.trim()
        };
    }

    /**
     * Analyzes how the user's requested feature fits into the existing codebase.
     * Instructs Gemini to look at codebase context and the user's feature to:
     *   - Clarify core requirements
     *   - Consider how the codebase is organized
     *   - Identify potential design or architectural implications
     *   - Identify open questions or ambiguities
     */
    async howProblemFitsIntoCodebase(codebaseDescriptionShort: string, codebaseDescriptionLong: string, problemDescription: string): Promise<string> {
        const prompt = `
You have:
1) A short summary of a codebase (about 50 chars).
2) An in-depth description of that same codebase.
3) A user's description of a new feature they want.

Your job:
- Interpret the user's request in light of the codebase's existing patterns, architecture, and objectives.
- Consider how this feature might integrate with existing modules or designs.
- Highlight any uncertainties or ambiguities about the user's request that might need clarification.
- Whenever you find a possible ambiguity, propose an assumption to keep things moving if the user doesn't clarify.

Short Codebase Summary:
${codebaseDescriptionShort}

---
Detailed Codebase Description:
${codebaseDescriptionLong}

---
User's Requested Feature:
${problemDescription}
        `;
        
        return this.gemini.generateText(prompt);
    }

    /**
     * Cross-checks or refines the initial analysis of the feature by comparing it 
     * against the actual code in the codebase. The goal is to look for:
     *   - Code conventions or patterns that the initial analysis missed
     *   - Potential conflicts with existing features
     *   - Opportunities to reuse or extend existing solutions
     *   - Additional assumptions that should be made for a consistent design
     */
    async howProblemsWithCode(
        codebaseDescriptionShort: string, 
        codebaseDescriptionLong: string, 
        problemDescription: string, 
        previousAnalysis: string
    ): Promise<string> {
        const combinedContent = this.getCombinedCodebaseContent();

        const prompt = `
You have:
1) A short summary of the codebase.
2) An in-depth description of the codebase.
3) A user-requested feature to be implemented.
4) An initial analysis of how that feature fits into the codebase.
5) The actual codebase itself (combined source).

Task:
- Read the entire codebase to identify any relevant details the initial analysis overlooked or misunderstood.
- Check for code patterns, naming conventions, or architectural styles that we should maintain.
- Point out any conflicts with existing logic or data flows.
- Propose additional assumptions or clarifications if certain details remain ambiguous.
- If you see simpler or more robust ways to integrate the new feature (based on how other features are integrated), describe them.

Short Codebase Summary:
${codebaseDescriptionShort}

---
Detailed Codebase Description:
${codebaseDescriptionLong}

---
User's Requested Feature:
${problemDescription}

---
Initial Analysis of How the Feature Fits:
${previousAnalysis}

---
Entire Codebase:
${combinedContent}
        `;
        
        return this.gemini.generateText(prompt);
    }

    /**
     * Identifies precisely which files and/or functions might need to be modified or created
     * in order to implement the new feature. Also explains why those files are relevant.
     * 
     * Uses multiple iterative analyses (three passes) to refine the identification of relevant files.
     */
    async getProblemFitsWhere(
        codebaseDescriptionShort: string, 
        codebaseDescriptionLong: string, 
        problemDescription: string, 
        previousAnalysis: string, 
        problemsWithCode: string
    ): Promise<string> {
        const combinedContent = this.getCombinedCodebaseContent();
        if (!combinedContent) {
            return "No codebase content found.";
        }
        
        // Base prompt for each iteration
        const basePrompt = `
You have:
1) A short summary of the codebase.
2) An in-depth description of the codebase.
3) A user's requested feature.
4) Previous analyses (two separate analyses) about how the feature fits.
5) The entire codebase source.

Task:
- Examine the codebase in detail to figure out which files and functions are relevant for implementing the requested feature.
- Explain how each relevant file is associated with the feature (e.g., the data flow, a particular module's function, or a service).
- Suggest potential new functions or classes if nothing existing fits well.
- Specifically highlight why some files are irrelevant, if that helps clarify the approach.

Short Codebase Summary:
${codebaseDescriptionShort}

---
Detailed Codebase Description:
${codebaseDescriptionLong}

---
User's Requested Feature:
${problemDescription}

---
Previous Analysis (How the Feature Fits):
${previousAnalysis}

---
Analysis Cross-Checked with the Code:
${problemsWithCode}

---
Entire Codebase:
${combinedContent}
        `;

        console.log("Running multi-iteration analysis to identify relevant files...");
        const analyses: string[] = [];
        
        // Perform 3 iterative analyses
        for (let i = 0; i < 3; i++) {
            console.log(`Iteration #${i + 1}`);
            
            let iterationPrompt = basePrompt;
            if (i > 0) {
                iterationPrompt += `

--- 
Previous Iteration(s) Output:
${analyses.map((analysis, index) => `Analysis #${index + 1}:\n${analysis}`).join("\n---\n")}
                
Refine or expand upon the previous iteration(s). Focus on any disagreements or additional details you might have missed. Also consider if any prior iteration introduced confusion or needed clarifications.
                `;
            }
            
            const geminiResponse = await this.gemini.generateText(iterationPrompt);
            analyses.push(geminiResponse);
        }

        // Summarize or synthesize all three analyses into one final statement.
        const summaryPrompt = `
Now, please synthesize these three iterative analyses into a single coherent discussion.

Be sure to:
- Converge on which files are definitely relevant.
- Call out any open questions or uncertainties.
- Summarize any significant differences among the three iterations.
- Present it in a concise manner, focusing on which parts of the code are most critical to modify or review for the new feature.

Analyses:
1) ${analyses[0]}

---
2) ${analyses[1]}

---
3) ${analyses[2]}
        `;
        
        return this.gemini.generateText(summaryPrompt);
    }

    /**
     * Utility to combine the entire codebase. You could optionally store it
     * in memory or process it for a more efficient approach (e.g., chunking).
     * 
     * For demonstration, this version simply returns a single large string.
     */
    getCombinedCodebaseContent(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return "";
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const combinedContent = FileCombiner.combineTypeScriptFiles(rootPath);
        return combinedContent ?? "";
    }

    /**
     * Example function to list all .ts files in the workspace and log their contents.
     * Not directly used in the analysis, but shown here as an example.
     */
    getFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const fileList = FileCombiner.listAllFiles(rootPath, ".ts");
        console.log(fileList);

        const firstFile = fileList.find(file => !file.isDirectory);
        if (firstFile) {
            const fileContent = FileCombiner.getFileContent(firstFile.path);
            console.log(fileContent);
        }
    }

    /**
     * Generate an organized set of questions and assumptions needed before proceeding.
     * This multi-step approach prompts Gemini in successive stages, refining each step.
     */
    async generateQuestionsAndAssumptions(
        codebaseDescriptionShort: string, 
        codebaseDescriptionLong: string, 
        problemDescription: string, 
        previousAnalysis: string, 
        problemsWithCode: string, 
        problemFitsWhere: string
    ): Promise<string> {
        console.log("Generating questions and assumptions with a multi-step approach...");

        // STEP 1: Detailed Explanation
        const detailedExplanationPrompt = `
Given the codebase summaries, the user's requested feature, and previous analyses, 
provide a detailed explanation of:
1) What the user wants.
2) How you envision solving it within this codebase.
3) Potential pitfalls or edge cases that a developer should keep in mind.

Short Codebase Summary:
${codebaseDescriptionShort}

---
Detailed Codebase Description:
${codebaseDescriptionLong}

---
User's Requested Feature:
${problemDescription}

---
Initial Analysis:
${previousAnalysis}

---
Refined Analysis (Cross-Check):
${problemsWithCode}

---
Relevant Files & Areas:
${problemFitsWhere}
        `;
        const detailedExplanation = await this.gemini.generateText(detailedExplanationPrompt);

        // STEP 2: Evaluate the Proposed Solution
        const evaluationPrompt = `
Evaluate the below proposed solution against the original user request. 
Look for:
- Completeness: Does it address every aspect of the user's described feature?
- Consistency: Does it align with how the codebase typically handles similar functionality?
- Gaps or Misalignments: Is there anything left unclear or unaddressed?

User's Requested Feature:
${problemDescription}

---
Proposed Solution Explanation:
${detailedExplanation}
        `;
        const evaluation = await this.gemini.generateText(evaluationPrompt);

        // STEP 3: Revise the Explanation
        const revisedExplanationPrompt = `
You have a proposed solution and an evaluation of how well it addresses the user's request. 
Revise the solution explanation to fix identified gaps, clarify any fuzzy areas, and ensure it aligns with the user request.

Original Explanation:
${detailedExplanation}

---
Evaluation:
${evaluation}
        `;
        const revisedExplanation = await this.gemini.generateText(revisedExplanationPrompt);

        // STEP 4: Identify Ambiguities / Create Potential Questions
        const questionsPrompt = `
Now that we have a revised explanation, identify any critical uncertainties or ambiguities that absolutely require user input.
These questions should be minimal: only what is truly necessary to prevent major rework or confusion during implementation. 
Aim for no more than 6-8 questions.

User's Requested Feature:
${problemDescription}

---
Revised Explanation:
${revisedExplanation}

---
Prior Analyses:
- How the feature fits: ${previousAnalysis}
- Cross-check analysis: ${problemsWithCode}
- Relevant files: ${problemFitsWhere}
        `;
        const potentialQuestions = await this.gemini.generateText(questionsPrompt);

        // STEP 5: Analyze Those Questions and Possibly Eliminate or Combine Some
        const questionAnalysisPrompt = `
We have a set of potential clarifying questions for the user. 
Your task:
- Eliminate any questions that are non-essential or can be inferred from existing code patterns or typical best practices.
- Combine questions if they are closely related.
- Ultimately, produce a short list of only the highest-importance questions.

User's Requested Feature:
${problemDescription}

---
Potential Questions:
${potentialQuestions}

---
Context:
- Analyses: ${previousAnalysis}
- Cross-check: ${problemsWithCode}
- Relevant files: ${problemFitsWhere}
- Revised Explanation: ${revisedExplanation}
        `;
        const questionAnalysis = await this.gemini.generateText(questionAnalysisPrompt);

        // NEW STEP: Codebase Pattern Analysis
        const combinedContent = this.getCombinedCodebaseContent();
        const codebasePatternPrompt = `
Analyze how this codebase has historically implemented or integrated similar features. 
Focus on:
1) Existing modules, patterns, or naming conventions that might inform how these questions could be answered.
2) Typical ways the codebase handles user input or domain data flows.
3) Examples of how new features have been integrated in the past.

Questions:
${potentialQuestions}

---
Question Analysis:
${questionAnalysis}

---
Entire Codebase:
${combinedContent}
        `;
        const codebasePatternAnalysis = await this.gemini.generateText(codebasePatternPrompt);

        // STEP 6: Attempt to Answer the Questions with Reasonable Assumptions
        const answerAttemptsPrompt = `
Using the codebase context, prior analyses, and the pattern analysis, attempt to answer each question preemptively. 
Make reasonable assumptions wherever you can, basing your logic on how similar scenarios were handled. 
Only leave a question truly open if the codebase or prior analyses do not provide enough information to make a confident assumption.

Potential Questions:
${potentialQuestions}

---
Question Analysis:
${questionAnalysis}

---
Revised Explanation:
${revisedExplanation}

---
Codebase Pattern Analysis:
${codebasePatternAnalysis}
        `;
        const answerAttempts = await this.gemini.generateText(answerAttemptsPrompt);

        // STEP 7: Generate Final List of Questions with Assumptions
        const finalQuestionsPrompt = `
Now generate a final, minimal list of questions for the user. 
For each question, include your assumption(s) and your confidence in those assumptions (High, Medium, Low). 
If the assumption is strong and consistent with existing patterns, consider omitting the question entirely to reduce user burden.

Format:
1) Question: [text, if absolutely needed]
   Assumption: [what you assume if the user doesn't clarify]
   Confidence: [High/Medium/Low]

The goal is to have at most 6 critical questions that genuinely require user input.

Potential Questions:
${potentialQuestions}

---
Analyzed/Reduced Questions:
${questionAnalysis}

---
Codebase Pattern Analysis:
${codebasePatternAnalysis}

---
Attempted Answers (with assumptions):
${answerAttempts}
        `;
        const finalQuestions = await this.gemini.generateText(finalQuestionsPrompt);

        return finalQuestions;
    }

    async readRequirementsFromFile(): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.error("No workspace folders found");
            return null;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const raydocDir = path.join(rootPath, 'raydoc');
        const requirementsFilePath = path.join(raydocDir, 'requirements.md');
        
        if (!fs.existsSync(requirementsFilePath)) {
            console.error("requirements.md file not found");
            return null;
        }
        
        try {
            const fileContent = fs.readFileSync(requirementsFilePath, 'utf8');
            return fileContent;
        } catch (error) {
            console.error("Error reading requirements.md file:", error);
            return null;
        }
    }
    
    async generateDesignDocument(requirementsContent: string): Promise<void> {
        console.log("Generating detailed design document...");
        
        // Create a prompt for generating a comprehensive design document
        const designDocPrompt = `
I will give you a set of requirements for a new feature, along with context about the codebase.
Your task is to create a detailed design document that follows the template structure below.

The design document should:
1. Be comprehensive and detailed enough to guide implementation
2. Be easy for developers to read and understand
3. Follow all the information received about the design up to this point
4. Include specific technical details relevant to the codebase
5. Provide clear rationales for all design decisions

Short Codebase Description:
${this.codebaseDescription?.fiftyCharDescription}

---
Detailed Codebase Description:
${this.codebaseDescription?.inDepthDescription}

---
User's Original Feature Request:
${this.task}

---
Analysis of How the Feature Fits into the Codebase:
${this.problemFitsIntoCodebase}

---
Analysis (Cross-Check with Codebase for Potential Issues or Refinements):
${this.problemsWithCode}

---
Relevant Files and Their Potential Involvement:
${this.problemFitsWhere}

---
Requirements Document:
${requirementsContent}

---
Design Document Template:
# [Feature/Component Name] Design Document

## Current Context
- Brief overview of the existing system
- Key components and their relationships
- Pain points or gaps being addressed

## Requirements

### Functional Requirements
- List of must-have functionality
- Expected behaviors
- Integration points

### Non-Functional Requirements
- Performance expectations
- Scalability needs
- Observability requirements
- Security considerations

## Design Decisions

### 1. [Major Decision Area]
Will implement/choose [approach] because:
- Rationale 1
- Rationale 2
- Trade-offs considered

### 2. [Another Decision Area]
Will implement/choose [approach] because:
- Rationale 1
- Rationale 2
- Alternatives considered

## Technical Design

### 1. Core Components
\`\`\`typescript
// Key interfaces/classes with type hints
class MainComponent {
    // Core documentation
}
\`\`\`

### 2. Data Models
\`\`\`typescript
// Key data models with type hints
interface DataModel {
    // Model documentation
}
\`\`\`

### 3. Integration Points
- How this interfaces with other systems
- API contracts
- Data flow diagrams if needed

## Implementation Plan

1. Phase 1: [Initial Implementation]
   - Task 1
   - Task 2
   - Expected timeline

2. Phase 2: [Enhancement Phase]
   - Task 1
   - Task 2
   - Expected timeline

3. Phase 3: [Production Readiness]
   - Task 1
   - Task 2
   - Expected timeline

## Testing Strategy

### Unit Tests
- Key test cases
- Mock strategies
- Coverage expectations

### Integration Tests
- Test scenarios
- Environment needs
- Data requirements

## Observability

### Logging
- Key logging points
- Log levels
- Structured logging format

### Metrics
- Key metrics to track
- Collection method
- Alert thresholds

## Future Considerations

### Potential Enhancements
- Future feature ideas
- Scalability improvements
- Performance optimizations

### Known Limitations
- Current constraints
- Technical debt
- Areas needing future attention

## Dependencies

### Runtime Dependencies
- Required libraries
- External services
- Version constraints

### Development Dependencies
- Build tools
- Test frameworks
- Development utilities

## Security Considerations
- Authentication/Authorization
- Data protection
- Compliance requirements

## Rollout Strategy
1. Development phase
2. Testing phase
3. Staging deployment
4. Production deployment
5. Monitoring period

## References
- Related design documents
- External documentation
- Relevant standards

Please fill in this template with detailed, specific information for the Variable Upstream Tracking feature. Use TypeScript for code examples instead of Python. Make sure all sections are thoroughly completed with specific details relevant to this feature and codebase.
`;
        
        // Generate the design document
        console.log("Generating design document content...");
        const designDocContent = await this.gemini.generateText(designDocPrompt);
        
        // Save the design document to a file
        await this.saveDesignDocumentToFile(designDocContent);
        
        vscode.window.showInformationMessage("Design document generated and saved to raydoc/design_document.md");
    }
    
    async saveDesignDocumentToFile(designDocument: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.error("No workspace folders found");
            return;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        const raydocDir = path.join(rootPath, 'raydoc');
        const designDocFilePath = path.join(raydocDir, 'design_document.md');
        
        try {
            if (!fs.existsSync(raydocDir)) {
                fs.mkdirSync(raydocDir, { recursive: true });
            }
            
            fs.writeFileSync(designDocFilePath, designDocument, 'utf8');
            
            const fileUri = vscode.Uri.file(designDocFilePath);
            await vscode.window.showTextDocument(fileUri);
            
        } catch (error) {
            console.error("Error saving design document to file:", error);
        }
    }
}
