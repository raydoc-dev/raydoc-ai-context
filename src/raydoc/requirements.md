# Requirements Document for Variable Upstream Tracking Feature

# Final Refined Requirements

# High-Level Requirements

**REQ-H1: Provide a command and integrate with existing methods of invocation (e.g., code actions, hover providers) to initiate the variable upstream tracking feature.**

*Justification: Combines the user's requests for a command and integration with existing functionality.*

**REQ-H2: The feature should identify and display all upstream code elements that influence the value of a selected variable.**

*Justification: Directly addresses the core user request to "see all of the upstream things that affect the value of a specific variable." "Influence" includes direct assignments, indirect modifications through function calls with side effects, and mathematical operations. Display includes clear visual hierarchical presentation with hyperlinking.*

**REQ-H3: The feature should be easy to use, requiring minimal user actions to initiate and providing easily understandable results.**

*Justification: Directly addresses the user's desire to "make this feature as easy to use as possible." This is achieved by limiting user actions and using clear presentation.*

# Medium-Level Requirements

**REQ-M1: A command should be provided to initiate the variable upstream tracking feature, accessible via the command palette using a descriptive name.** (Parent: REQ-H1)

*Justification: User requested "a command" for the feature, and integration with "other functionality that we already offer", suggesting the use of the existing command palette system.*

**REQ-M2: The variable upstream tracking feature should be accessible via code actions when a variable is selected in the code editor.** (Parent: REQ-H1)

*Justification: User requested integration with "all of the other ways to call it that we already have", and code actions are one of the existing methods.*

**REQ-M3: The variable upstream tracking feature should be accessible via a hover provider, triggered when hovering over a variable in the code editor.** (Parent: REQ-H1)

*Justification: User requested integration with "all of the other ways to call it that we already have", and hover providers are one of the existing methods.*

**REQ-M4: The feature should identify code elements that directly assign a value to the selected variable.** (Parent: REQ-H2)

*Justification: Identifying direct assignments is a fundamental aspect of tracking how a variable's value is determined. This contributes to showing "all of the upstream things that affect the value of a specific variable."*

**REQ-M5: The feature should identify code elements that indirectly modify the selected variable's value through function calls (where the function call includes a side effect that changes the variable).** (Parent: REQ-H2)

*Justification: Indirect modifications via function calls are part of the "upstream things that affect the value of a specific variable." The inclusion of "side effects" ensures it captures meaningful influences.*

**REQ-M6: The feature should identify code elements that participate in mathematical operations that directly affect the selected variable.** (Parent: REQ-H2)

*Justification: Mathematical operations are a common way variables are modified. Including this ensures the user can "see all of the upstream things that affect the value of a specific variable."*

**REQ-M7: The displayed upstream code elements should be presented in a clear, hierarchical structure showing the order of influence, with the most immediate influencers closest to the selected variable.** (Parent: REQ-H2, REQ-H3)

*Justification: Displaying the information in a hierarchical structure contributes to "ease of use" by making the information easier to understand. The user wants to "see all of the upstream things that affect the value," but needs to understand their relationships.*

**REQ-M8: Each displayed upstream code element should be hyperlinked to its location in the code editor, allowing the developer to quickly navigate to the source code.** (Parent: REQ-H2, REQ-H3)

*Justification: Hyperlinking enables fast navigation to related code locations which improves the "ease of use" and allows the user to quickly verify the dependencies.*

**REQ-M9: Activating the variable upstream tracking feature via any method (command, code action, hover) should require no more than two user actions (e.g., clicks, keystrokes).** (Parent: REQ-H3)

*Justification: Limiting the number of actions needed to initiate the feature contributes to "ease of use". This provides a measurable goal for usability.*

# Low-Level Requirements

**REQ-L1: Register a new command in `extension.ts` with the ID "raydoc.trackVariableUpstream".** (Parent: REQ-M1)

*Justification: This fulfills the requirement for a command to initiate the feature and integrates with the existing command palette system.*

**REQ-L2: The "raydoc.trackVariableUpstream" command should execute the `traceDataFlow` function (or equivalent) with the currently selected variable as input.** (Parent: REQ-M1)

*Justification: This connects the command to the core data flow analysis logic.*

**REQ-L3: Modify `RaydocCodeActionProvider` in `extension.ts` to provide a code action labeled "Track Variable Upstream" when a variable is selected in the code editor.** (Parent: REQ-M2)

*Justification: This fulfills the code action accessibility requirement.*

**REQ-L4: The code action should execute the `traceDataFlow` function (or equivalent) with the selected variable as input.** (Parent: REQ-M2)

*Justification: This connects the code action to the core data flow analysis logic.*

**REQ-L5: Enhance `RaydocHoverProvider` in `extension.ts` to optionally display a short summary of the variable's upstream data flow when hovering over a variable. The summary should include a link to trigger the full `traceDataFlow` analysis if desired.** (Parent: REQ-M3)

*Justification: This fulfills the hover provider accessibility requirement. Linking to the full analysis ensures the feature is readily discoverable from the hover provider.*

**REQ-L6: Implement a `traceDataFlow` function (or equivalent) in `getReferences.ts` (initially) that takes a variable identifier as input.** (Parent: REQ-M4, REQ-M5, REQ-M6)

*Justification: This is the core function that performs the upstream data flow analysis.*

**REQ-L7: Within `traceDataFlow`, use `vscode.executeReferenceProvider` to find all references to the input variable. Handle potential limitations in accuracy and scope.** (Parent: REQ-M4)

*Justification: Uses VS Code API to gather relevant information. Limitations of the API must be handled.*

**REQ-L8: Within `traceDataFlow`, filter the references to identify locations where the input variable is assigned a value.** (Parent: REQ-M4)

*Justification: Focuses the analysis on points where the variable's value changes.*

**REQ-L9: For each assignment location, trace the source of the assigned value. This may involve recursively calling `traceDataFlow` on other variables or analyzing the expression being assigned.** (Parent: REQ-M4, REQ-M5, REQ-M6)

*Justification: Recursively finds where a variable's value comes from, if assigned from another variable.*

**REQ-L10: Within `traceDataFlow`, identify function calls where the input variable is passed as an argument to a function that modifies it.** (Parent: REQ-M5)

*Justification: Addresses indirect modifications to a variable's value.*

**REQ-L11: In `functions.ts`, implement/optimize `getFunctionDefinition` to efficiently identify the function definition given a function call. Use the current line parsing method and consider caching results to improve performance.** (Parent: REQ-M5)

*Justification: Required to analyze function side effects efficiently.*

**REQ-L12: Within `traceDataFlow`, identify mathematical operations that directly affect the input variable.** (Parent: REQ-M6)

*Justification: Accounts for mathematical operations that change the value of the variable.*

**REQ-L13: Define `DataFlowPath` and `DataFlowNode` interfaces in `types.ts` to represent the structure of the upstream data flow. `DataFlowNode` should include the code element (e.g., assignment statement, function call) and its location in the code.** (Parent: REQ-M3, REQ-M7)

*Justification: Defines how the results will be structured for display and analysis.*

**REQ-L14: Modify the `traceDataFlow` function to construct a `DataFlowPath` object representing the upstream data flow for the input variable.** (Parent: REQ-M7)

*Justification: Populates the data structure for the feature.*

**REQ-L15: Implement two formatting strategies in `toString.ts` for the `DataFlowPath` object: one for human readability (hierarchical structure) and one for LLM consumption (JSON format).** (Parent: REQ-M7)

*Justification: Supports both user understanding and future agent integration.*

**REQ-L16: Format the human-readable `DataFlowPath` output as a hierarchical tree in VS Code's output panel, clearly showing the order of influence, with hyperlinks to the source code location of each node.** (Parent: REQ-M7, REQ-M8)

*Justification: Addresses the display and navigation requirements.*

**REQ-L17: Ensure that activating the variable upstream tracking feature via command, code action, or hover requires no more than two user actions (e.g., clicks, keystrokes).** (Parent: REQ-M9)

*Justification: Directly addresses the usability requirement.*

**REQ-L18: Add analytics tracking in `extension.ts` to track the usage of the variable upstream tracking feature.** (Parent: REQ-M1, REQ-M2, REQ-M3)

*Justification: Enables tracking and improvement of the new feature.*

**REQ-L19: Implement error handling within the `traceDataFlow` function to gracefully handle cases where the upstream data flow cannot be fully determined (e.g., due to VS Code API limitations or complex code structures). Display informative error messages to the user in the output panel.** (Parent: REQ-M4, REQ-M5, REQ-M6)

*Justification: Provides robustness and informs the user about potential issues.*

**REQ-L20: In `agent/agent.ts`, modify the prompts used by the LLM agent to include the JSON formatted data flow information generated by the `traceDataFlow` function.** (Parent: REQ-M7)

*Justification: Enables the agent to leverage the data flow information.*

**REQ-L21: In `agent/agent.ts`, abstract the LLM API calls, allowing for configuration to use different LLMs.** (Parent: REQ-M7)

*Justification: Abstraction increases versatility.*

**REQ-L22: In `agent/agent.ts`, implement a function that serializes the state of the agent's class variables to disk, and another function to load this state from disk when the agent is initialized.** (Parent: REQ-M7)

*Justification: Preserves the agent's state between sessions.*

**REQ-L23: In `agent/file-combiner.ts`, modify the class to only load a file into memory when the path is passed into the function.** (Parent: REQ-M7)

*Justification: Reduces the amount of memory needed to run an agent step.*

**REQ-L24: Implement a function that adds a comment to the file that describes the thought process of creating the data flow at each node.** (Parent: REQ-M7)

*Justification: Adds transparency to the process by describing how each node was found.*

**REQ-L25: Modify the `traceDataFlow` function to only request references from the VSCode API on relevant files.** (Parent: REQ-M4)

*Justification: Performance is greatly increased by limiting the scope of the API.*

# Traceability Matrix

| Requirement | User Statement                                                                               |
| ----------- | -------------------------------------------------------------------------------------------- |
| REQ-H1      | "should have a command and then all of the other ways to call it that we already have"        |
| REQ-H2      | "see all of the upstream things that affect the value of a specific variable"                   |
| REQ-H3      | "I want to make this feature as easy to use as possible"                                      |
| REQ-M1      | "should have a command and then all of the other ways to call it that we already have"        |
| REQ-M2      | "should have a command and then all of the other ways to call it that we already have"        |
| REQ-M3      | "should have a command and then all of the other ways to call it that we already have"        |
| REQ-M4      | "see all of the upstream things that affect the value of a specific variable"                   |
| REQ-M5      | "see all of the upstream things that affect the value of a specific variable"                   |
| REQ-M6      | "see all of the upstream things that affect the value of a specific variable"                   |
| REQ-M7      | "see all of the upstream things that affect the value of a specific variable"  AND "I want to make this feature as easy to use as possible"                                                |
| REQ-M8      | "see all of the upstream things that affect the value of a specific variable"  AND "I want to make this feature as easy to use as possible"                   |
| REQ-M9      | "I want to make this feature as easy to use as possible"                                      |
| REQ-L1-L25    | All trace back through their medium and high level parents |

