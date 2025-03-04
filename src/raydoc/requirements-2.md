# Requirements Document for Variable Upstream Tracking Feature

Okay, based on the review and suggested improvements, here's the final, simplified set of requirements with clear traceability:

# High-Level Requirements

*   **REQ-H1: The system shall provide a command to initiate the feature.**
    *   *Justification:*  Mirrors existing functionality as requested by the user. (Traceable to: "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality.")
*   **REQ-H2: The system shall trace the value of a specified variable to identify the upstream variables, functions, or code elements that directly influence its value.**
    *   *Justification:* Core feature request. (Traceable to: "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.")
*   **REQ-H3: The system shall limit the initial trace depth of upstream dependencies to a maximum of 2.**
    *   *Justification:* To prevent excessive tracing and improve initial usability. (Traceable to: "Maybe try 2 initially")
*   **REQ-H4: The system shall format and display the upstream trace in a user-friendly manner.**
    *   *Justification:* Addresses usability concerns and makes the feature easily understandable.  (Traceable to: "I want to make this feature as easy to use as possible.")

# Medium-Level Requirements

*   **REQ-M1: The system shall register a command to initiate the variable upstream tracing, accepting a variable name as input. The command name should be descriptive and follow existing command-line conventions.** (Parent: REQ-H1)
    *   *Justification:*  Provides the basic mechanism for user invocation.
*   **REQ-M2: The system shall provide the same access to the command as other system functions.** (Parent: REQ-H1)
    *   *Justification:*  Ensures seamless integration and consistent user experience.
*   **REQ-M3: The system shall identify all direct assignments to the specified variable within the current scope.** (Parent: REQ-H2)
    *   *Justification:*  Identifies the most immediate upstream influence.
*   **REQ-M4: The system shall identify function calls that return a value assigned to the specified variable or a variable used in the assignment.** (Parent: REQ-H2)
    *   *Justification:*  Extends the trace to indirect influences.
*   **REQ-M5: The system shall identify usages of the specified variable or variables used in assignments as arguments to function calls.** (Parent: REQ-H2)
    *   *Justification:*  Extends the trace beyond direct assignments
*   **REQ-M6: The system shall identify code elements (e.g., mathematical operations, string concatenations, list comprehensions) that directly contribute to calculating the value assigned to the specified variable or variables used in the assignment.** (Parent: REQ-H2)
    *   *Justification:* Captures calculations and transformations.
*   **REQ-M7: The system shall trace upstream dependencies for the initially specified variable to a maximum depth of 2, at which point tracing shall terminate.** (Parent: REQ-H3)
    *   *Justification:* Implements the depth limit to prevent excessive tracing.
*   **REQ-M9: The system shall display the trace as a directed graph or a nested list, clearly showing the relationships between variables and their dependencies.** (Parent: REQ-H4)
    *   *Justification:* Specifies a format for easy understanding.
*   **REQ-M10: The system shall display the code location (file and line number) for each element (variable, function call, code element) in the trace.** (Parent: REQ-H4)
    *   *Justification:* Provides context for investigation.
*   **REQ-M11: The system shall highlight the specified variable and any variables that directly influence its value within the displayed trace.** (Parent: REQ-H4)
    *   *Justification:* Helps users quickly identify key parts of the trace.

# Low-Level Requirements

*   **REQ-L1: Register a command named `raydoc.traceVariableUpstream` in `extension.ts`.** (Parent: REQ-M1)
    *   *Justification:* Specific implementation detail for command registration.
*   **REQ-L2: The `raydoc.traceVariableUpstream` command handler in `extension.ts` shall prompt the user for the variable name to trace using a standard VS Code input method.** (Parent: REQ-M1)
    *   *Justification:* Implementation detail for getting variable name input.
*   **REQ-L3: The `raydoc.traceVariableUpstream` command handler in `extension.ts` shall persist and re-use the last entered variable name to pre-populate the input prompt.** (Parent: REQ-M1)
    *   *Justification:* Enhances usability by remembering previous input.
*   **REQ-L4: Add a CodeLens provider to `extension.ts` that activates when the cursor is on a variable. The CodeLens should provide an action to "Trace Upstream Dependencies".** (Parent: REQ-M2)
    *   *Justification:* Implements CodeLens integration.
*   **REQ-L5: The CodeLens action should call the `raydoc.traceVariableUpstream` command, passing the variable under the cursor as an argument.** (Parent: REQ-M2)
    *   *Justification:*  Connects CodeLens action to the command handler.
*   **REQ-L6: The `raydoc.traceVariableUpstream` command handler in `extension.ts` shall call the `gatherContext` function in `context.ts`, passing the entered variable name and the `traceVariableUpstream` flag as arguments.** (Parent: REQ-M3, REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:*  Triggers the context gathering process.
*   **REQ-L7: Modify `gatherContext` in `context.ts` to accept a `traceVariableUpstream` flag.** (Parent: REQ-M3, REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:* Adapts the existing context gathering mechanism.
*   **REQ-L8: In `context.ts`, if the `traceVariableUpstream` flag is true, `gatherContext` shall call the `traceVariableDependencies` function in `dependencyTracing.ts`, passing the variable name and the active text editor.** (Parent: REQ-M3, REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:*  Initiates dependency tracing.
*   **REQ-L9: Create a new file `src/dependencyTracing.ts` with the function `traceVariableDependencies(variableName: string, editor: vscode.TextEditor): Promise<VariableTraceResult>`.** (Parent: REQ-M3, REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:* Creates the dependency tracing function.
*   **REQ-L10: The `traceVariableDependencies` function in `dependencyTracing.ts` shall call `getVariableDefinition` in `functions.ts` to locate the definition of the specified variable in the current document.** (Parent: REQ-M3)
    *   *Justification:* Locates the variable's definition.
*   **REQ-L11: Create a new function `getVariableDefinition(variableName: string, document: vscode.TextDocument, position: vscode.Position): Promise<vscode.SymbolInformation | undefined>` in `functions.ts`.** (Parent: REQ-M3)
    *   *Justification:* Creates the function for finding variable definitions.
*   **REQ-L12: The `getVariableDefinition` function shall use `vscode.executeDocumentSymbolProvider` to retrieve document symbols and filter them to find a variable symbol whose name matches the `variableName` and is at the given `position`.** (Parent: REQ-M3)
    *   *Justification:*  Implementation detail for finding definitions.
*   **REQ-L13: If `getVariableDefinition` fails to locate a definition for the specified variable, `traceVariableDependencies` shall return an empty `VariableTraceResult` and display an error message to the user using `vscode.window.showErrorMessage`.** (Parent: REQ-M3, REQ-H4)
    *   *Justification:* Handles error cases gracefully.
*   **REQ-L14: Define a `VariableTraceResult` type in `src/types.ts` to represent the output of the tracing process. This type should contain a list of `vscode.SymbolInformation` objects, representing the upstream dependencies.** (Parent: REQ-M3, REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:* Defines the data structure for the tracing results.
*   **REQ-L15: The `traceVariableDependencies` function in `dependencyTracing.ts` shall call a recursive function `traceDefinitionUpstream(definition: vscode.SymbolInformation, currentDepth: number): Promise<vscode.SymbolInformation[]>` to traverse the upstream dependencies of the identified definition.** (Parent: REQ-M4, REQ-M5, REQ-M6, REQ-M7)
    *   *Justification:*  Implements the recursive tracing algorithm.
*   **REQ-L16: The `traceDefinitionUpstream` function shall use `vscode.executeDefinitionProvider` to find the definitions of variables used in the definition of the current variable.** (Parent: REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:* Implementation detail for finding variable definitions.
*   **REQ-L17: The `traceDefinitionUpstream` function shall use `vscode.executeReferenceProvider` to find the references of the current definition and determine if it is used as an argument to a function call, assigned to another variable, or used in a calculation.** (Parent: REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:* Implementation detail for finding references.
*   **REQ-L18: The `traceDefinitionUpstream` function shall limit the recursion depth to a maximum of 2.** (Parent: REQ-M7)
    *   *Justification:* Enforces the depth limit.
*   **REQ-L19: The `traceDefinitionUpstream` function shall handle circular dependencies by detecting them and stopping the recursion to prevent infinite loops. Display an error message to the user using `vscode.window.showErrorMessage`.** (Parent: REQ-M7, REQ-H4)
    *   *Justification:* Prevents infinite loops and informs the user.
*   **REQ-L20: The `traceDefinitionUpstream` function shall return a list of `vscode.SymbolInformation` objects, representing the upstream dependencies found during the tracing process.** (Parent: REQ-M3, REQ-M4, REQ-M5, REQ-M6)
    *   *Justification:* Returns the results of the tracing.
*   **REQ-L21: The `traceVariableDependencies` function shall format and display the `VariableTraceResult` in a user-friendly manner using the existing Raydoc output panel. Use a directed graph or a nested list structure to represent the dependencies.** (Parent: REQ-M9, REQ-M10, REQ-M11, REQ-H4)
    *   *Justification:* Formats the results for display.
*   **REQ-L22: In the displayed trace, include the code location (file and line number) for each variable, function call, and code element.** (Parent: REQ-M10, REQ-H4)
    *   *Justification:*  Provides code location information.
*   **REQ-L23: In the displayed trace, highlight the initially specified variable and any variables that directly influence its value. Use different colors or styles to distinguish between them.** (Parent: REQ-M11, REQ-H4)
    *   *Justification:* Highlights key elements in the trace.
*   **REQ-L24: Modify `src/agent/agent.ts` to augment LLM prompts with dependency information to enhance summary quality.** (Parent: REQ-M9, REQ-H4)
    *   *Justification:* Allows LLM to take advantage of new features
*   **REQ-L25: Add unit tests to `src/test/extension.test.ts` to verify the functionality of the `traceVariableUpstream` command and the dependency tracing logic.** (Parent: REQ-M1, REQ-M3, REQ-M4, REQ-M5, REQ-M6, REQ-M7, REQ-M9, REQ-M10, REQ-M11)
    *   *Justification:* Ensures the functionality is working as intended.

# Traceability Matrix

| Requirement | User Statement(s)                                                                                                                                 |
|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| REQ-H1      | My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality. |
| REQ-H2      | I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.          |
| REQ-H3      | Maybe try 2 initially                                                                                                                              |
| REQ-H4      | I want to make this feature as easy to use as possible.                                                                                       |
| REQ-M1      | My thought is that this would fit into the other functionality that we already offer and should have a command.                          |
| REQ-M2      | My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality. |
| REQ-M3      | I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.          |
| REQ-M4      | I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.          |
| REQ-M5      | I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.          |
| REQ-M6      | I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable.          |
| REQ-M7      | Maybe try 2 initially |
| REQ-M9      | I want to make this feature as easy to use as possible.                                                                                       |
| REQ-M10     | I want to make this feature as easy to use as possible.                                                                                       |
| REQ-M11     | I want to make this feature as easy to use as possible.                                                                                       |
| REQ-L1  through REQ-L25   | Derived to Implement Higher Level Requirements |

This revised set of requirements is streamlined, traceable, and well-justified. It should provide a solid foundation for implementation.

