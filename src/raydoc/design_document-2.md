# Variable Upstream Tracking Design Document

## Current Context

- **Brief overview of the existing system:** The Raydoc AI Context extension assists developers by gathering code context and leveraging an LLM (Google Gemini) to automate documentation and design tasks. Key features include context gathering, LLM integration, and VS Code integration. The Agent performs analysis in multiple stages/runs, allowing user feedback.
- **Key components and their relationships:** The core components are:
    *   `extension.ts`: Entry point, command registration, analytics initialization, `Agent` instantiation.
    *   `agent/agent.ts`: Core logic, orchestrates context gathering, LLM interaction, and output generation.
    *   `agent/gemini.ts`: LLM interface, handles API communication.
    *   `context.ts`: Gathers code context.
    *   `fileTree.ts`: Generates file tree representation.
    *   `functions.ts`: Extracts function definitions.
    *   `getReferences.ts`: Extracts function and type references.
    *   `packages.ts`: Extracts package dependencies.
    *   `types.ts`: Defines data structures.
    *   `variable.ts`: (New) Variable Analysis Utilities
    *   `dataflow.ts`: (New) Core dataflow engine
- **Pain points or gaps being addressed:** The existing extension lacks the ability to trace the dataflow of variables. Developers need to understand where variable values originate and how they are affected by upstream code. This feature fills that gap.

## Requirements

### Functional Requirements

*   **FR1: Command Registration:** The extension must register a command (`raydoc.traceVariableUpstream`) accessible via the command palette, context menu, and keyboard shortcut.
    *   *Expected Behavior:* Executing the command initiates the variable upstream tracking workflow.
*   **FR2: Variable Selection:** The extension must prompt the user to select a variable from the active text editor.
    *   *Expected Behavior:* A list of available variables is presented to the user.
*   **FR3: Dependency Analysis:** The extension must identify and trace upstream dependencies affecting the value of the selected variable.
    *   *Expected Behavior:* Identifies assignments, function calls, and other operations that influence the variable's value.
*   **FR4: Dependency Graph Generation:** The extension must generate a `DataflowGraph` representing the variable's upstream dependencies.
    *   *Expected Behavior:* The `DataflowGraph` accurately represents the dataflow relationships.
*   **FR5: Visual Representation:** The extension must present the `DataflowGraph` in a VS Code tree view, showing variable names, code locations, and dependency types.
    *   *Expected Behavior:* The tree view provides a clear and navigable representation of the dependencies.
*   **FR6: Code Navigation:** Clicking on a node in the dependency tree must open the corresponding file and highlight the code location.
    *   *Expected Behavior:* Seamless navigation to the source code of each dependency.
*   **FR7: Dependency Type Visualization:** The extension must use visual cues (icons, colors) to differentiate between different types of dependencies.
    *   *Expected Behavior:* Improved clarity in the dependency tree.
*   **FR8: Circular Dependency Detection:** The extension must detect and handle circular dependencies to prevent infinite loops.
    *   *Expected Behavior:* Circular dependencies are identified and the analysis stops tracing that branch.
*   **FR9: Maximum Recursion Depth:** The extension must enforce a maximum recursion depth to limit the scope of the analysis.
    *   *Expected Behavior:* Analysis stops at the specified depth.
*   **FR10: Integration with VS Code settings:** The settings will have keys `raydoc.maxRecursionDepth`, `raydoc.enableCircularDependencyDetection`, `raydoc.defaultKeyboardShortcut`.
    *   *Expected Behavior:* Each one of the settings affects the behaviour of the corresponding functionality.

### Non-Functional Requirements

*   **NFR1: Performance:** The analysis should be completed within a reasonable timeframe (e.g., under 10 seconds for a typical file).
    *   *Justification:* Avoid impacting the developer's workflow.
*   **NFR2: Scalability:** The extension should be able to handle large codebases without significant performance degradation.
    *   *Justification:* Support projects of varying sizes.
*   **NFR3: Observability:** The extension should provide logging and metrics to monitor its performance and identify potential issues.
    *   *Justification:* Facilitates debugging and performance optimization.
*   **NFR4: Error Handling:** The extension must handle potential errors gracefully and provide informative error messages to the user.
    *   *Justification:* Ensures a smooth user experience.
*   **NFR5: Language Support:** The extension should primarily focus on Typescript and Javascript, but future extension to other languages (Python, etc.) should be considered.
    *   *Justification:* Support the most common languages used in VS Code.
*   **NFR6: LLM Reliance:** LLM usage must be balanced against performance and cost. Static Analysis should be used where possible.
    *   *Justification:* Minimize API costs and latency.

## Design Decisions

### 1. Context Gathering Strategy
Will implement a **new module `variableContext.ts` and a `gatherVariableContext` function** because:
- **Rationale 1:** Variable context gathering requires different logic than function context gathering. Separating them improves code organization and maintainability. There is minimal overlapping code, so refactoring `context.ts` isn't optimal.
- **Rationale 2:** Using a dedicated module allows for future expansion of variable-specific context gathering features without impacting existing functionality.
- **Trade-offs considered:** Extending the existing `context.ts` would tightly couple function and variable context gathering, potentially leading to code complexity.

### 2. Dataflow Analysis Engine
Will implement a **new module `dataflow.ts`** because:
- **Rationale 1:** Encapsulates the core dataflow analysis logic, promoting modularity and testability.
- **Rationale 2:** Allows for easy swapping of different analysis engines in the future (e.g., switching from LLM-based to static analysis).
- **Trade-offs considered:** Integrating the analysis logic directly into `agent/agent.ts` would make the code harder to read, maintain, and test.

### 3. Dependency Tracing Approach
Will use a **recursive approach with LLM assistance and a maximum recursion depth** because:
- **Rationale 1:** Recursive tracing allows for exploring the full chain of dependencies.
- **Rationale 2:** LLM assistance is necessary to handle complex control flow and implicit dependencies.
- **Rationale 3:** A maximum recursion depth prevents infinite loops and controls performance.
- **Trade-offs considered:** Static analysis alone would not be sufficient for handling complex code. Using an LLM without a recursion limit could lead to performance issues.

### 4. Data Structure for Dependency Graph
Will use a **tree-like data structure** (implemented as nested objects) for the `DataflowGraph` because:
- **Rationale 1:** A tree structure naturally represents the hierarchical relationships between variables and their dependencies.
- **Rationale 2:** Tree structures are easily traversable for display in a VS Code tree view.
- **Trade-offs considered:** Graph databases could provide more advanced features but would add unnecessary complexity for this use case.

### 5. Circular Dependency Detection Approach
Will use a **set to store visited variables during the dataflow analysis** because:
- **Rationale 1:** Efficiently checks for cycles during graph traversal.
- **Rationale 2:** No need to modify the core `DataflowGraph` data model.
- **Trade-offs considered:** Other approaches like marking nodes in the graph with a "visited" flag would modify the data structure, impacting code clarity.

### 6. Selection of UI Icons and colors
Will **adopt the theme of VS Code and the extension** because:
- **Rationale 1:** Will maintain the style of the extension and VS Code overall.
- **Rationale 2:** It's easy to follow the existing styling.
- **Trade-offs considered:** Creating a custom theme would require more development time.

## Technical Design

### 1. Core Components

```typescript
// in variableContext.ts
import * as vscode from 'vscode';

export async function gatherVariableContext(editor: vscode.TextEditor, position: vscode.Position): Promise<VariableDefinition | undefined> {
    // Logic to identify the variable at the given position
    // and extract its definition, type, and scope.
    // Leverages the Typescript language service API.
    return undefined; // Return a VariableDefinition object or undefined if not found
}

// in dataflow.ts
import * as vscode from 'vscode';
import { VariableDefinition, DataflowGraph } from '../types';
import { Gemini } from './gemini'; // Assuming Gemini class is in agent/gemini.ts

export async function analyzeVariableDataflow(variable: VariableDefinition, gemini: Gemini, maxDepth: number = 10, enableCircularDependencyDetection: boolean = true): Promise<DataflowGraph> {
    // Core dataflow analysis logic
    // Uses the LLM to identify dependencies, handles loops, and manages recursion.
    // Builds and returns the DataflowGraph
    return {} as DataflowGraph;
}

// in agent/agent.ts
import * as vscode from 'vscode';
import { VariableDefinition, DataflowGraph } from '../types';
import { analyzeVariableDataflow } from '../dataflow';
import { Gemini } from './gemini';

export class Agent {

    constructor(private readonly gemini: Gemini) {}

    async analyzeVariableDataflowWrapper(variable: VariableDefinition): Promise<DataflowGraph> {
        // Wrapper for analyzeVariableDataflow to interact with the existing Agent class
        const maxRecursionDepth = vscode.workspace.getConfiguration('raydoc').get<number>('maxRecursionDepth', 10);
        const enableCircularDependencyDetection = vscode.workspace.getConfiguration('raydoc').get<boolean>('enableCircularDependencyDetection', true);

        return await analyzeVariableDataflow(variable, this.gemini, maxRecursionDepth, enableCircularDependencyDetection);
    }
}
```

### 2. Data Models

```typescript
// in types.ts
import * as vscode from 'vscode';

export interface VariableDefinition {
    name: string;
    type: string;
    position: vscode.Position;
    uri: vscode.Uri;
    scope: string; // "local", "module", "global", etc.
}

export interface DataflowNode {
    variable: VariableDefinition;
    dependencyType: string; // "assignment", "functionCall", "parameterPassing", etc.
    children: DataflowNode[];
    codeSnippet?: string; // The code snippet where the variable is used.
}

export interface DataflowGraph {
    root: DataflowNode;
}
```

### 3. Integration Points

- **VS Code Command:**  The `raydoc.traceVariableUpstream` command is registered in `extension.ts` and triggers the `handleTraceVariableUpstream` function.
- **Context Menu:** A "Trace Variable Upstream" option is added to the editor context menu, calling the same `handleTraceVariableUpstream` function.
- **Keyboard Shortcut:** Configurable via VS Code settings, also triggering the `raydoc.traceVariableUpstream` command.
- **Agent:** `handleTraceVariableUpstream` in `extension.ts` calls `agent.analyzeVariableDataflowWrapper` in `agent/agent.ts` to perform the analysis.
- **Dataflow Analysis:** The `analyzeVariableDataflow` function in `dataflow.ts` uses the LLM (via `agent/gemini.ts`) to identify dependencies.
- **VS Code Tree View:** The `DataflowGraph` is transformed into a tree-like structure and displayed in a VS Code tree view using the `vscode.TreeView` API.

## Implementation Plan

1. Phase 1: Core Functionality (Estimated Time: 2 weeks)
   - Task 1: Implement `gatherVariableContext` in `variableContext.ts` (REQ-L5, REQ-L6, REQ-L7).
   - Task 2: Implement the basic structure of `analyzeVariableDataflow` in `dataflow.ts`, focusing on identifying direct dependencies within the current file using a simplified LLM prompt (REQ-L12, REQ-L14, REQ-L15).
   - Task 3: Implement VS Code command registration, context menu integration, and keyboard shortcut configuration (REQ-L1, REQ-L2, REQ-L8, REQ-L9, REQ-L10, REQ-L11).
   - Task 4: Implement the basic VS Code Tree View to display the dependency graph, showing variable names and code locations (REQ-L20, REQ-L21).

2. Phase 2: Enhanced Analysis and UI (Estimated Time: 2 weeks)
   - Task 1: Enhance `analyzeVariableDataflow` to recursively trace dependencies up to a limited depth, handling simple function calls (REQ-L17).
   - Task 2: Implement circular dependency detection (REQ-L18).
   - Task 3: Implement dependency type visualization using icons and/or colors (REQ-L22, REQ-L23).
   - Task 4: Improve the LLM prompt to handle more complex code scenarios (REQ-L15).

3. Phase 3: Optimization and Refinement (Estimated Time: 1 week)
   - Task 1: Optimize performance by reducing LLM calls where possible and caching results.
   - Task 2: Refine the UI based on user feedback.
   - Task 3: Implement robust error handling and informative error messages (REQ-L24).

## Testing Strategy

### Unit Tests

- **`variableContext.ts`:**
    -   Test cases for identifying variables at different positions in the code.
    -   Test cases for extracting the correct variable name, type, and scope.
    -   Mock the Typescript Language Service API.
    -   Coverage expectation: 90%.
- **`dataflow.ts`:**
    -   Test cases for identifying direct dependencies in simple code scenarios.
    -   Test cases for handling function calls.
    -   Test cases for recursive dependency tracing.
    -   Mock the LLM API (`agent/gemini.ts`).
    -   Coverage expectation: 80%.
- **`Agent` class:**
    -   Tests for orchestrating the dataflow analysis workflow.
    -   Mock `variableContext.ts` and `dataflow.ts`.
    -   Coverage expectation: 70%.

### Integration Tests

- **Scenario 1:** Trace the dependencies of a local variable in a simple function.
- **Scenario 2:** Trace the dependencies of a global variable that is modified in multiple files.
- **Scenario 3:** Trace the dependencies of a variable involved in a circular dependency.
- **Environment needs:** VS Code with the Raydoc AI Context extension installed.
- **Data requirements:** Sample code files with varying levels of complexity.

## Observability

### Logging

- **Key logging points:**
    -   Entering and exiting key functions (e.g., `analyzeVariableDataflow`, `gatherVariableContext`).
    -   LLM API calls (requests and responses).
    -   Errors encountered during analysis.
    -   Circular dependency detection.
- **Log levels:**
    -   `INFO` for general workflow events.
    -   `DEBUG` for detailed analysis information.
    -   `ERROR` for errors and exceptions.
- **Structured logging format:** JSON.

### Metrics

- **Key metrics to track:**
    -   Analysis time per variable.
    -   Number of LLM API calls per analysis.
    -   Maximum recursion depth reached.
    -   Number of circular dependencies detected.
    -   Error rate.
- **Collection method:** PostHog (existing telemetry system).
- **Alert thresholds:** Set alerts for high analysis times, error rates, and LLM API call counts.

## Future Considerations

### Potential Enhancements

-   Support for other programming languages (Python, etc.).
-   More sophisticated LLM prompts to handle complex code patterns.
-   Integration with debugging tools to visualize dataflow during runtime.
-   Graphical representation of the dependency graph using a VS Code webview.
-   Ability to customize the scope of the analysis (e.g., exclude certain files or directories).
-   Contextual display of variable values during debugging, in line with the graph itself.

### Known Limitations

-   Performance limitations with very large codebases and deep dependency chains.
-   Accuracy limitations due to the reliance on the LLM for dependency analysis.
-   Limited support for dynamic languages and complex control flow.

## Dependencies

### Runtime Dependencies

-   VS Code API
-   Google Gemini API (via `agent/gemini.ts`)

### Development Dependencies

-   Node.js
-   TypeScript
-   VS Code Extension API
-   PostHog

## Security Considerations

-   **Authentication/Authorization:** The extension uses the Google Gemini API key provided by the user. Store this key securely and avoid exposing it in logs or client-side code.
-   **Data protection:** The extension does not collect or store any user code. Telemetry data is anonymized.
-   **Compliance requirements:** Ensure compliance with the Google Gemini API terms of service and any applicable privacy regulations.

## Rollout Strategy

1.  **Development phase:** Implement the core functionality and unit tests.
2.  **Testing phase:** Conduct integration tests and gather feedback from internal users.
3.  **Staging deployment:** Deploy the extension to a staging environment for broader testing.
4.  **Production deployment:** Release the extension to the VS Code Marketplace.
5.  **Monitoring period:** Monitor performance, error rates, and user feedback.

## References

-   VS Code Extension API documentation: [https://code.visualstudio.com/api](https://code.visualstudio.com/api)
-   Google Gemini API documentation
-   Existing Raydoc AI Context codebase.
