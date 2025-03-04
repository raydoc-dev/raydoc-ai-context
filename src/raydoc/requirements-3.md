# Requirements Document for Variable Upstream Tracking Feature

Okay, here is the final, simplified set of requirements with traceability information, formatted as requested:

# High-Level Requirements

**REQ-H1: Provide a command to initiate the variable upstream tracking feature.**
*   **Justification:** Direct response to the user's desire for a command to trigger the functionality.

**REQ-H2: Integrate the feature into the existing command line and context menu options used by other functionalities in the Raydoc AI Context extension.**
*   **Justification:** Direct response to the user's statement about wanting "all of the other ways to call it that we already have for all of the other functionality."

**REQ-H3: Present the dataflow information using formatted text in the VS Code Output Channel.**
*   **Justification:** Explicitly confirmed by the user as an acceptable means of presentation.

**REQ-H4: Analyze code throughout the workspace, connected to the selected variable via LSP, to determine the upstream dependencies of a selected variable.**
*   **Justification:** Based on the user's answer to Question 2, specifying workspace-wide analysis constrained by LSP connections.

**REQ-H5: Utilize Language Server Protocol (LSP) to follow connections between symbols and identify upstream dependencies.**
*   **Justification:** Explicitly requested by the user: "using LSP to follow connections."

**REQ-H6: The tool should provide a clear and understandable error message to the user if it cannot find any upstream dependencies for the selected variable.**
*   **Justification:** Derived from user statement that they wanted the feature to be easy to use.

**REQ-H7: The upstream dependencies should be displayed in a way that clearly shows the data flow path and complete within 5 seconds for most common use cases.**
*   **Justification:** Derived from user statement that they wanted the feature to be easy to use.

# Medium-Level Requirements

**REQ-M1: Implement a VS Code command (e.g., "Track Variable Upstream") to trigger the variable upstream tracking analysis.**
*   **Parent:** REQ-H1
*   **Justification:** Provides a specific mechanism for the user to initiate the feature.

**REQ-M2: Make the "Track Variable Upstream" command accessible through the command palette in VS Code.**
*   **Parent:** REQ-H2
*   **Justification:** Integrates with existing calling methods.

**REQ-M3: Integrate the "Track Variable Upstream" functionality into the context menu (right-click menu) for variables in the code editor.**
*   **Parent:** REQ-H2
*   **Justification:** Integrates with existing calling methods.

**REQ-M4: Display the upstream dataflow information as formatted text within the VS Code Output Channel.**
*   **Parent:** REQ-H3
*   **Justification:** Provides a direct response to the user's acceptance of the output channel presentation.

**REQ-M5: Structure the formatted text in the Output Channel to clearly show the data flow from upstream dependencies to the selected variable.**
*   **Parent:** REQ-H3, REQ-H7
*   **Justification:** Extends how the output will be structured to be easy to use.

**REQ-M6: The dataflow information presented in the output channel must include the file and line number for each upstream dependency.**
*   **Parent:** REQ-H3
*   **Justification:** Adds detail to the output.

**REQ-M7: The analysis should use the LSP "Find All References" functionality or equivalent to trace the uses of variables and identify upstream dependencies.**
*   **Parent:** REQ-H5
*   **Justification:** Directly utilizes the LSP functionality requested by the user.

**REQ-M8: Limit the analysis to code connected to the selected variable via LSP "Find All References" functionality.**
*   **Parent:** REQ-H4, REQ-H5
*   **Justification:** Limits the scope of the analysis in accordance to the users requests.

**REQ-M9: If no upstream dependencies are found for the selected variable, display a clear and informative message in the Output Channel indicating that no dependencies were found.**
*   **Parent:** REQ-H6
*   **Justification:** Provides usability to the user to understand if no results were found.

**REQ-M10: The upstream dataflow tracking should execute in a reasonable time (e.g., complete within 5 seconds) for most common use cases.**
*   **Parent:** REQ-H7
*   **Justification:** Provides a concrete usability metric to ensure the system will be quick to use.

# Low-Level Requirements

**REQ-L1: Create a new command `raydoc.trackVariableUpstream` in the `package.json` file to register the command with VS Code.**
*   **Parent:** REQ-M1
*   **Justification:** Implement a command in VS Code.

**REQ-L2: Implement the `raydoc.trackVariableUpstream` command handler in `src/extension.ts`.**
*   **Parent:** REQ-M1
*   **Justification:** Implement a command in VS Code.

**REQ-L3: Add the `raydoc.trackVariableUpstream` command to the VS Code command palette via `contributes.commands` in `package.json`.**
*   **Parent:** REQ-M2
*   **Justification:** Make the feature call accessible from the VS Code Command Pallette.

**REQ-L4: Implement a context menu entry for variables in the code editor that triggers the `raydoc.trackVariableUpstream` command. This requires adding an entry under `contributes.menus.editor/context` in `package.json` that targets variables through language-specific selectors.**
*   **Parent:** REQ-M3
*   **Justification:** Make the feature call accessible from the context menu.

**REQ-L5: Create a new class (or set of functions) in `src/dataflow.ts` to encapsulate the data flow analysis logic.**
*   **Parent:** REQ-M4, REQ-M7, REQ-M8
*   **Justification:** Create data flow analysis logic.

**REQ-L6: The `DataFlowAnalysis` class (or equivalent) in `src/dataflow.ts` should take a `vscode.Position` and `vscode.TextDocument` as input to identify the variable under the cursor and its location.**
*   **Parent:** REQ-M7, REQ-M8
*   **Justification:** Create data flow analysis logic.

**REQ-L7: Implement a language-specific variable identifier in `src/functions.ts` that uses the LSP to determine whether the cursor rests on a variable or not, returning the name of the variable**
*   **Parent:** REQ-M7
*   **Justification:** Create data flow analysis logic.

**REQ-L8: Implement the `FileService` interface and its concrete class in `src/agent/file-combiner.ts`. Ensure the `FileService` is injectable.**
*   **Parent:** REQ-M8
*   **Justification:** Ensure the code is testable.

**REQ-L9: The dataflow analysis should leverage the LSP "Find All References" functionality (or equivalent using `vscode.references.findReferences`) to identify all references to the selected variable within the workspace.**
*   **Parent:** REQ-M7
*   **Justification:** Leverage LSP to find all variables.

**REQ-L10: Filter the references found by LSP to only include those within the same workspace as the opened files.**
*   **Parent:** REQ-M8
*   **Justification:** Only include references in the workspace.

**REQ-L11: Recursively traverse the references, identifying assignments and other operations that modify the variable's value. Store the dataflow chain in a data structure, e.g. in the `DataFlowTraceNode` defined in `src/types.ts`.**
*   **Parent:** REQ-M5, REQ-M7, REQ-M8
*   **Justification:** Recursively trace references to modify the value.

**REQ-L12: The `DataFlowTraceNode` should contain the variable name, file path, line number, and a description of the operation performed on the variable.**
*   **Parent:** REQ-M5, REQ-M6
*   **Justification:** Data structure should include all information.

**REQ-L13: Implement a `toString` method (or equivalent) in `src/toString.ts` that formats the `DataFlowTraceNode` hierarchy into human-readable text.  Include `LocationLink` objects for easy navigation.**
*   **Parent:** REQ-M4, REQ-M5, REQ-M6
*   **Justification:** Data output into human readable text.

**REQ-L14: Output the formatted text to the VS Code Output Channel, using a dedicated channel name (e.g., "Raydoc AI Context - Dataflow").**
*   **Parent:** REQ-M4
*   **Justification:** Output the formatted text to the VS Code output channel.

**REQ-L15: When no upstream dependencies are found, output a message to the Output Channel stating "No upstream dependencies found for variable [variable name]".**
*   **Parent:** REQ-M9
*   **Justification:** Output the message to the VS Code output channel if no upstream dependencies are found.

**REQ-L16: Implement performance monitoring using `console.time` and `console.timeEnd` around the core dataflow analysis logic in `src/dataflow.ts`. Log the execution time to the console.**
*   **Parent:** REQ-M10
*   **Justification:** Add performance monitoring of the core dataflow analysis logic.

**REQ-L17: Implement caching for LSP "Find All References" results to avoid redundant calls when analyzing the same variable multiple times within a short period. Requires a cache invalidation strategy (e.g., based on file modification timestamps).**
*   **Parent:** REQ-M10
*   **Justification:** Implement caching to avoid redundant calls for better performace.

# Traceability Matrix

| Requirement | User Input                                                                                                                                                                                                                   |
|-------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| REQ-H1      | "should have a command"                                                                                                                                                                                                    |
| REQ-H2      | "all of the other ways to call it that we already have for all of the other functionality"                                                                                                                                 |
| REQ-H3      | User answer to Question 1: "For the initial version, this is fine" (referring to using formatted text in the VS Code Output Channel)                                                                                     |
| REQ-H4      | User answer to Question 2: "Analyze code throughout the workspace, but just that which is connected to the symbol under question using LSP to follow connections"                                                        |
| REQ-H5      | User answer to Question 2: "using LSP to follow connections"                                                                                                                                                              |
| REQ-H6      | "I want to make this feature as easy to use as possible."                                                                                                                                                                  |
| REQ-H7      | "I want to make this feature as easy to use as possible."                                                                                                                                                                  |
| REQ-M1      | "should have a command"                                                                                                                                                                                                    |
| REQ-M2      | "all of the other ways to call it that we already have for all of the other functionality"                                                                                                                                 |
| REQ-M3      | "all of the other ways to call it that we already have for all of the other functionality"                                                                                                                                 |
| REQ-M4      | User answer to Question 1: "For the initial version, this is fine" (referring to using formatted text in the VS Code Output Channel)                                                                                     |
| REQ-M5      | User answer to Question 1: "For the initial version, this is fine" (referring to using formatted text in the VS Code Output Channel), "I want to make this feature as easy to use as possible."                                |
| REQ-M6      | User answer to Question 1: "For the initial version, this is fine" (referring to using formatted text in the VS Code Output Channel)                                                                                     |
| REQ-M7      | User answer to Question 2: "using LSP to follow connections"                                                                                                                                                              |
| REQ-M8      | User answer to Question 2: "Analyze code throughout the workspace, but just that which is connected to the symbol under question using LSP to follow connections"                                                        |
| REQ-M9      | "I want to make this feature as easy to use as possible."                                                                                                                                                                  |
| REQ-M10     | "I want to make this feature as easy to use as possible."                                                                                                                                                                  |
| REQ-L1-17   | Trace through the matrix, since the High and Medium level requirements point to the user input already                                                                                                                     |

This comprehensive output provides a clear and traceable set of requirements for implementing the variable upstream tracking feature.  The traceabilty matrix clearly shows the origins of each requirement.

