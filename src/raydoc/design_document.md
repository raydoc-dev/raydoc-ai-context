# Variable Upstream Tracking Design Document

## Current Context
- The existing "Raydoc AI Context" extension assists developers by gathering and formatting code context for LLMs.
- Key components include `extension.ts` (entry point), `context.ts` (context gathering), `functions.ts` (function definition retrieval), `fileTree.ts` (directory tree), `packages.ts` (dependencies), `types.ts` (data structures), `toString.ts` (formatting context), `agent/agent.ts` (core class that orchestrates the LLM-powered analysis), `agent/file-combiner.ts` (combines the contents of multiple files into a single string), and `agent/gemini.ts` (encapsulates the interaction with the Google Gemini API). PostHog is used for analytics.
- A major gap is the lack of built-in data flow analysis, hindering tasks like identifying the origin of variable values and potential side effects. This feature aims to fill this gap by tracing the upstream influence on a specific variable's value.
- `getReferences.ts` is used to get references in the code but it's limited. `file-combiner.ts` is memory intensive and cannot effectively be used on large projects.

## Requirements

### Functional Requirements
- **REQ-F1:** Provide a command ("raydoc.trackVariableUpstream") accessible via the command palette to initiate variable upstream tracking.
- **REQ-F2:** Provide a code action ("Track Variable Upstream") that appears when a variable is selected in the code editor.
- **REQ-F3:** Provide a hover provider that, when hovering over a variable, shows a summary of its upstream data flow and a link to initiate a full trace.
- **REQ-F4:** Identify and trace direct assignments to the selected variable.
- **REQ-F5:** Identify function calls where the variable is passed as an argument and modified within the function (side effects).
- **REQ-F6:** Identify mathematical operations that directly affect the selected variable.
- **REQ-F7:** Display the upstream code elements in a hierarchical structure, hyperlinked to their source code locations.
- **REQ-F8:** Generate a JSON representation of the data flow for LLM consumption.
- **REQ-F9:** Integrate the feature into the LLM agent, providing data flow information to the prompts.
- **REQ-F10:** Abstraction should be made in the agent so that other LLMs can be used.
- **REQ-F11:** The agent class should save and load the state of its class variables to disc.
- **REQ-F12:** The file combiner class should accept an array of file paths to load.
- **REQ-F13:** Implement a function that adds a comment to the file that describes the thought process of creating the data flow at each node.
- **REQ-F14:** Modify the `traceDataFlow` function to only request references from the VSCode API on relevant files.
- **REQ-F15:** Show an informative warning to the user when the code is too large to pass to the LLM.

### Non-Functional Requirements
- **REQ-NF1 (Performance):** The data flow analysis should complete within a reasonable timeframe (e.g., <5 seconds for a typical function). Caching should be considered for frequently accessed data.
- **REQ-NF2 (Usability):** The feature should be intuitive and easy to use. Activating the feature should require no more than two user actions.
- **REQ-NF3 (Scalability):** The feature should be able to handle codebases of moderate size (e.g., up to 10,000 lines of code). File-combiner should limit memory use.
- **REQ-NF4 (Observability):** Key events (e.g., feature activation, errors) should be logged for debugging and monitoring.
- **REQ-NF5 (Error Handling):** The feature should gracefully handle errors and provide informative messages to the user.
- **REQ-NF6 (Maintainability):** The code should be well-structured, documented, and testable.
- **REQ-NF7 (Accuracy):** Provide the most accurate data flow analysis with the best possible performance given the capabilities of the VS Code API.
- **REQ-NF8 (State Saving):** The state of the agent should be saved in case the process has to stop.
- **REQ-NF9 (Thought process comments):** The thought process of how the data flow was created should be added as comments to the file.

## Design Decisions

### 1. Location of Data Flow Analysis Logic
Will implement the `traceDataFlow` function initially within `getReferences.ts` and refactor to a separate `dataflow.ts` module *only* if performance becomes an issue or the logic becomes too complex.

- Rationale 1: Minimizes initial code duplication and leverages existing infrastructure in `getReferences.ts` (e.g., reference finding).
- Rationale 2: Allows for a quicker initial implementation and easier experimentation.
- Trade-offs considered: Potential performance impact on `getReferences.ts` and increased complexity within that module. Refactoring to a separate module would address these, but adds initial development overhead.

### 2. Function Definition Retrieval
Will optimize `getFunctionDefinition` in `functions.ts` to efficiently retrieve function definitions using a combination of line parsing, caching and symbol lookup.

- Rationale 1: Existing methods are inefficient, requiring the analysis of all symbols every time.
- Rationale 2: Caching the results will greatly improve performance
- Trade-offs considered: There is added memory usage to store the cache.

### 3. Data Flow Representation
Will use the `DataFlowPath` and `DataFlowNode` interfaces (defined below) to represent the structure of the upstream data flow.

- Rationale 1: Provides a structured representation of the data flow, suitable for both human display and LLM consumption.
- Rationale 2: Facilitates hierarchical display of the data flow in the output panel.
- Trade-offs considered: Requires defining and maintaining these interfaces.

### 4. UI Presentation
Will display the data flow information in a hierarchical tree structure in the VS Code output panel, with hyperlinks to the source code location of each node.

- Rationale 1: Hierarchical display provides a clear and intuitive representation of the data flow.
- Rationale 2: Hyperlinks allow for easy navigation to the source code, improving usability.
- Trade-offs considered: Requires formatting the output as a tree structure and handling hyperlinks. Alternative approaches (e.g., a simple list) would be simpler to implement but less user-friendly.

### 5. Language Support
Will initially focus on TypeScript, given the core extension is written in TypeScript. Support for other languages will be added later.

- Rationale 1: Simplifies the initial implementation and allows for leveraging existing TypeScript knowledge.
- Rationale 2: Provides a foundation for supporting other languages in the future.
- Trade-offs considered: Limits the initial applicability of the feature.

### 6. Codebase Loading
Will load files from disk and then use the "thought process comment" function to create comments describing the logic used to create each node.

- Rationale 1: LLMs do not have a natural "thought process", comments will provide the context needed to analyze the code properly.
- Rationale 2: Comments describing the thought process would improve the ability for the user to verify the accuracy of the dataflow.
- Trade-offs considered: This function will slow down the process greatly.

## Technical Design

### 1. Core Components
```typescript
// In types.ts
interface DataFlowNode {
    codeElement: string; // The code element (e.g., assignment statement, function call)
    location: vscode.Location; // Location of the code element in the code
    description: string; // Comment about the data flow that was used
}

interface DataFlowPath {
    variableName: string; // Name of the variable being tracked
    nodes: DataFlowNode[]; // Array of DataFlowNodes representing the upstream data flow
}

// In getReferences.ts (or dataflow.ts)
async function traceDataFlow(
    document: vscode.TextDocument,
    variableName: string,
    position: vscode.Position
): Promise<DataFlowPath> {
    // Core logic for tracing the data flow
    // - Find references to the variable
    // - Filter assignments and function calls
    // - Trace the source of the assigned value
    // - Construct the DataFlowPath object
}

async function addThoughtProcessComments(
    document: vscode.TextDocument,
    pathToVariable: DataFlowPath
) : Promise<vscode.TextEdit[]> {
    // Create a list of edit commands to insert the thought process as a comment
}
```

### 2. Data Models
```typescript
//In agent/agent.ts
interface LLMInterface {
    callLLM(dataFlow: DataFlowPath): string;
}

// Add LLM names to this enum to make configuration easier.
enum LLMs {
    Gemini,
    Cohere
}

class Agent {
    currentLLM: LLMInterface;

    constructor(llm: LLMs){
        switch (llm) {
            case LLMs.Gemini:
                this.currentLLM = new Gemini();
                break;
            case LLMs.Cohere:
                //this.currentLLM = new Cohere();
                break;
        }
    }
}
```

### 3. Integration Points
- **VS Code API:** Uses `vscode.commands.registerCommand`, `vscode.languages.registerCodeActionsProvider`, `vscode.languages.registerHoverProvider`, and `vscode.executeReferenceProvider`.
- **Output Panel:** Uses `vscode.window.createOutputChannel` to display the data flow information.
- **LLM Agent:** Provides the `DataFlowPath` object in JSON format to the prompts used by the LLM agent.

## Implementation Plan

1. Phase 1: [Core Data Flow Analysis]
   - Task 1: Implement `traceDataFlow` function in `getReferences.ts` for basic assignment tracking within a single function.
   - Task 2: Define `DataFlowPath` and `DataFlowNode` interfaces in `types.ts`.
   - Task 3: Implement a basic formatting strategy in `toString.ts` for human readability (hierarchical structure) and LLM consumption (JSON format).
   - Task 4: Implement state saving in `agent/agent.ts`
   - Task 5: Modify the file combiner to take a list of files.
   - Task 6: Implement adding comments to the code to describe the LLM thought process.
   - Task 7: Limit the request for references to the current file.
   - Expected timeline: 2 weeks

2. Phase 2: [UI Integration and Expansion]
   - Task 1: Register the "raydoc.trackVariableUpstream" command in `extension.ts`.
   - Task 2: Update `RaydocCodeActionProvider` in `extension.ts` to provide the code action.
   - Task 3: Enhance `RaydocHoverProvider` in `extension.ts` to provide the hover summary.
   - Task 4: Expand `traceDataFlow` to handle function call tracing, complex data structures, and control flow.
   - Task 5: Show a warning when the code to provide to the LLM is too large.
   - Expected timeline: 2 weeks

3. Phase 3: [LLM Integration, Testing, and Refinement]
   - Task 1: Integrate the feature into the LLM agent by modifying the prompts in `agent/agent.ts`.
   - Task 2: Implement unit tests for the `traceDataFlow` function.
   - Task 3: Refine the UI and data flow analysis based on user feedback and testing.
   - Task 4: Optimize performance and address any remaining issues.
   - Expected timeline: 2 weeks

## Testing Strategy

### Unit Tests
- Key test cases:
    - Tracing a simple assignment within a single function.
    - Tracing through a function call with side effects.
    - Tracing through mathematical operations.
    - Handling null and undefined values.
- Mock strategies:
    - Mock `vscode.executeReferenceProvider` to return predefined references.
    - Mock `getFunctionDefinition` to return predefined function definitions.
- Coverage expectations:
    - Aim for 80% code coverage for the `traceDataFlow` function.

### Integration Tests
- Test scenarios:
    - Activating the feature via the command palette, code action, and hover provider.
    - Tracing the data flow for variables in different types of code structures (e.g., functions, classes, loops).
    - Verifying the accuracy of the data flow information displayed in the output panel.
- Environment needs:
    - VS Code with the "Raydoc AI Context" extension installed.
    - A sample codebase with various code structures and dependencies.
- Data requirements:
    - Sample code files with variables, functions, and assignments to test different scenarios.

## Observability

### Logging
- Key logging points:
    - Feature activation (via command, code action, or hover).
    - Start and end of the `traceDataFlow` function.
    - Errors encountered during the data flow analysis.
- Log levels:
    - Use `INFO` for feature activation and start/end of `traceDataFlow`.
    - Use `ERROR` for errors encountered during the analysis.
- Structured logging format:
```json
{
    "timestamp": "2024-10-27T10:00:00.000Z",
    "level": "INFO",
    "message": "Feature activated via command",
    "command": "raydoc.trackVariableUpstream",
    "file": "path/to/file.ts",
    "line": 10
}
```

### Metrics
- Key metrics to track:
    - Average execution time of the `traceDataFlow` function.
    - Number of errors encountered during the data flow analysis.
    - Feature usage (number of activations via command, code action, and hover).
- Collection method:
    - Use PostHog to track feature usage and errors.
    - Use VS Code's `performance.mark` and `performance.measure` APIs to measure execution time.
- Alert thresholds:
    - Alert if the average execution time of `traceDataFlow` exceeds 5 seconds.
    - Alert if the number of errors exceeds a certain threshold (e.g., 10 errors per day).

## Future Considerations

### Potential Enhancements
- Support for other languages (Python, Java, etc.).
- More sophisticated data flow analysis (e.g., handling complex data structures, inter-procedural analysis).
- Integration with other VS Code features (e.g., refactoring tools, debugging tools).
- Visual representation of the data flow as a graph.

### Known Limitations
- The data flow analysis is limited by the accuracy and scope of the VS Code API.
- Performance may be an issue for large codebases.
- The feature currently only supports TypeScript.

## Dependencies

### Runtime Dependencies
- VS Code API
- Google Gemini API or other configured LLM API.

### Development Dependencies
- TypeScript
- VS Code Extension API
- Jest (for unit testing)
- ESLint (for code linting)

## Security Considerations
- Authentication/Authorization: The extension does not require any specific authentication or authorization mechanisms.
- Data protection: The extension does not store any sensitive user data. The gathered code context is only used for analysis and formatting.
- Compliance requirements: The extension should comply with all relevant privacy regulations.

## Rollout Strategy
1. Development phase: Implement the core data flow analysis logic and UI integration.
2. Testing phase: Conduct thorough unit and integration tests to ensure the accuracy and stability of the feature.
3. Staging deployment: Deploy the extension to a staging environment and test it with a representative sample of codebases.
4. Production deployment: Gradually roll out the extension to production users, monitoring performance and error rates.
5. Monitoring period: Continuously monitor the extension for any issues and address them promptly.

## References
- VS Code Extension API documentation: [https://code.visualstudio.com/api](https://code.visualstudio.com/api)
- Google Gemini API documentation: [https://ai.google.dev/](https://ai.google.dev/)
- Related design documents: None at this time
- Relevant standards: None at this time
