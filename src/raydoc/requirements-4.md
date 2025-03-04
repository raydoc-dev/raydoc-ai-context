# Requirements Document for Variable Upstream Tracking Feature

# High-Level Requirements

**REQ-H1: The feature must allow developers to trace the origin and modifications of a variable's value within the workspace.**
*Justification: Directly addresses the core user need to "see all of the upstream things that affect the value of a specific variable." The workspace scope is also explicitly defined by the user.*

**REQ-H2: The feature must integrate seamlessly with existing Raydoc Context functionalities, offering multiple access points.**
*Justification: Aligns with the user's desire to integrate with existing functionality, fitting it into "the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality."*

**REQ-H3: The feature should prioritize ease of use for developers, minimizing the steps required to trace a variable's origin and presenting information in a clear and understandable format.**
*Justification: Addresses the user's explicit request to "make this feature as easy to use as possible." The clarification adds specificity regarding minimization of steps and clarity of presentation.*

**REQ-H4: The feature must efficiently navigate and analyze code within the workspace.**
*Justification: Addresses the need to navigate code within the workspace.*

**REQ-H5: The feature should respect the codebase's existing telemetry practices without immediately requiring explicit consent for anonymous data collection.**
*Justification: Addresses the telemetry consideration, reflecting the user's statement that consent "shouldn't be required" given the anonymous data collection practices.*

# Medium-Level Requirements

**REQ-M1: The feature must allow users to select a variable within the workspace to initiate the upstream tracing process.**
*Parent: REQ-H1*
*Justification: Directly supports the user's need to "see all of the upstream things that affect the value of a specific variable." Requires the user to specify *which* variable they want to trace.*

**REQ-M2: The feature must identify all assignments and modifications to the selected variable within the workspace.**
*Parent: REQ-H1*
*Justification: Addresses the core user need to trace the "origin and modifications" of the variable's value.*

**REQ-M3: The feature must display the chain of dependencies leading to the selected variable's value, showing the origin and any intermediate calculations or assignments.**
*Parent: REQ-H1*
*Justification: Clarifies what "upstream things" means -- specifically the chain of dependencies (origin, intermediate calculations) that lead to the variable's value. Supports tracing the "origin" of the value.*

**REQ-M4: The feature must be accessible via the existing Raydoc command-line interface.**
*Parent: REQ-H2*
*Justification: Directly relates to the user's requirement for the feature to "have a command" as part of the existing functionality.*

**REQ-M5: The feature must be accessible through other existing Raydoc access points (e.g., context menu integration, keyboard shortcuts).**
*Parent: REQ-H2*
*Justification: Directly supports the user's request to have "all of the other ways to call it that we already have for all of the other functionality."*

**REQ-M6: The feature must present the tracing results in a clear and understandable format.**
*Parent: REQ-H3*
*Justification: Directly supports the "ease of use" requirement, specifically addressing the need to present information understandably, as outlined in the clarification for REQ-H3.*

**REQ-M7: The feature must minimize the number of user interactions required to initiate and view the tracing results.**
*Parent: REQ-H3*
*Justification: Directly supports the "ease of use" requirement, specifically addressing minimizing the steps required, as outlined in the clarification for REQ-H3.*

**REQ-M8: The feature must efficiently locate variable definitions and usages across the entire workspace.**
*Parent: REQ-H4*
*Justification: Addresses the need to "efficiently navigate and analyze code within the workspace" by focusing on locating variable definitions, which is essential for upstream tracing.*

**REQ-M9: The feature must analyze dependencies between code elements (variables, functions, classes) across multiple files within the workspace.**
*Parent: REQ-H4*
*Justification: Addresses the need to "efficiently navigate and analyze code within the workspace" by enabling code dependency analysis, essential for establishing the "upstream things" that affect a variable.*

**REQ-M10: The feature must integrate with the existing telemetry framework without requiring immediate explicit consent for anonymous data collection.**
*Parent: REQ-H5*
*Justification: Directly reflects the user's statement that explicit consent is "not necessary now" while respecting the codebase's "fully anonomous" data collection practices.*

# Low-Level Requirements

**REQ-L1: Implement a command `raydoc.traceVariableUpstream` in `extension.ts` to trigger the variable upstream tracing feature.**
*Parent: REQ-M4, REQ-M5*
*Justification: This creates the initial command line entrypoint for the feature (REQ-M4) and is necessary for integrating with existing Raydoc access points (REQ-M5) through keyboard shortcuts or menu options that can call this command.*

**REQ-L2: Add a context menu option labeled "Trace Variable Upstream" to trigger variable upstream tracing on the selected variable when right-clicking on a variable in the editor.**
*Parent: REQ-M5*
*Justification: Provides an additional, convenient access point through the existing Raydoc context menu integrations.*

**REQ-L3: Define a data structure `DependencyNode` in `types.ts` with properties `name: string`, `value: string`, `location: { uri: string, range: Range }`, and `children: DependencyNode[]`.**
*Parent: REQ-M3, REQ-M6*
*Justification: This defines the data structure for representing the dependency tree. `name` is the variable name. `value` is the assigned value (as a string, potentially from toString conversion). `location` specifies where the assignment occurs. `children` represent dependencies. This structure is used to present tracing results (REQ-M6).*

**REQ-L4: Add a `dependencyTree?: DependencyNode` property to the `RaydocContext` interface in `types.ts`.**
*Parent: REQ-M3*
*Justification: This allows the `dependencyTracer.ts` to pass the generated dependency tree back to the core Raydoc system for summarization and display.*

**REQ-L5: Create a file `dependencyTracer.ts` containing functions to trace variable dependencies.**
*Parent: REQ-M2, REQ-M8, REQ-M9*
*Justification: This modularizes the core tracing logic (REQ-M2), enabling the efficient location of variable definitions (REQ-M8) and the analysis of dependencies (REQ-M9) within the workspace.*

**REQ-L6: Implement a function `findVariableDefinition(variableName: string, filePath: string): { uri: string, range: Range } | undefined` in `dependencyTracer.ts` that uses the TypeScript compiler API to locate the definition of the given variable within the specified file.**
*Parent: REQ-M1, REQ-M2, REQ-M8*
*Justification: This function is a crucial first step (REQ-M1) in the tracing process. It allows identification of the variable's origin (REQ-M2, REQ-M8) before tracing its assignments. Using the TypeScript compiler API avoids asynchronous calls associated with LSP. The return type indicates either the location of the variable definition or undefined if no definition is found.*

**REQ-L7: Implement a function `getAssignments(variableName: string, filePath: string): { uri: string, range: Range, assignmentType: string }[]` in `dependencyTracer.ts` that uses the TypeScript AST to identify all assignments to the given variable within the specified file, indicating the type of assignment (`=`, `+=`, etc.).**
*Parent: REQ-M2, REQ-M8*
*Justification: This function identifies all points where the variable's value is potentially modified (REQ-M2, REQ-M8). The `assignmentType` helps determine the exact nature of the modification. It *must* use the AST, searching for `ts.SyntaxKind.EqualsToken` and related assignment operators.*

**REQ-L8: Implement a function `resolveAssignment(assignmentNode: ts.Node, filePath: string): DependencyNode` in `dependencyTracer.ts` that uses the TypeScript AST to determine the value assigned to a variable at a specific assignment point, handling literals, other variables, function calls, and object/array access. The function should recursively call itself to resolve dependencies. Returns a fully populated DependencyNode.**
*Parent: REQ-M2, REQ-M3, REQ-M9*
*Justification: This is the heart of the tracing logic. It determines the source of the assigned value (REQ-M2, REQ-M3, REQ-M9), handling different expression types through AST traversal and resolution. The recursive call allows tracing dependencies of dependencies. Returns a fully populated DependencyNode.*

**REQ-L9: Within `resolveAssignment`, if a circular dependency is detected, set a flag on the `DependencyNode` to indicate this and prevent infinite recursion.**
*Parent: REQ-M3, REQ-M6*
*Justification: Prevents stack overflow errors and provides useful feedback to the user if a circular dependency is present. The flag is used by toString to add a message.*

**REQ-L10: Modify the `gatherContext` function in `context.ts` to call the `dependencyTracer.ts` functions and populate the `dependencyTree` property of the `RaydocContext` with the results of the variable upstream tracing.**
*Parent: REQ-M3, REQ-M5*
*Justification: Integrates the variable upstream tracing feature into the existing Raydoc context gathering process (REQ-M5), making the dependency information available for further processing and display.*

**REQ-L11: Implement a `toString` function in `toString.ts` that formats the `DependencyNode` tree into a human-readable string representation.**
*Parent: REQ-M3, REQ-M6*
*Justification: Converts the dependency tree into a presentable format (REQ-M6) for display in the Raydoc output.*

**REQ-L12: In `extension.ts`, display the string representation of the dependency tree (generated by `toString.ts`) in the Raydoc output window after the tracing process is complete.**
*Parent: REQ-M6, REQ-M7*
*Justification: Presents the tracing results to the user in a clear and understandable format (REQ-M6) with minimal user interaction (REQ-M7).*

**REQ-L13: Initially focus the implementation on direct assignments and literal values within a single file.**
*Parent: REQ-M2, REQ-M8*
*Justification: Starts with the simplest cases to build a solid foundation and progressively expand functionality.*

**REQ-L14: Implement robust error handling in `dependencyTracer.ts` to gracefully handle cases where the AST parser fails or when unexpected code constructs are encountered. Log errors to the VS Code output window.**
*Parent: REQ-M6*
*Justification: Provides a better user experience by preventing crashes and providing informative error messages in cases of invalid or unsupported code, improving usability (REQ-M6).*

**REQ-L15: The telemetry framework does not require explicit consent for anonymous data collection. Therefore, implement the telemetry data collection by using current practices, ensuring that it is compliant with company policies.**
*Parent: REQ-M10*
*Justification: This ensures that the feature respects the current telemetry practices without adding unneeded complexity.*

# Traceability Matrix

| Requirement | User Statement(s)                                                                                                       |
|-------------|-------------------------------------------------------------------------------------------------------------------------|
| REQ-H1      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-H2      | "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality." |
| REQ-H3      | "I want to make this feature as easy to use as possible."                                                           |
| REQ-H4      | "Using LSP, this should be pretty easy to navigate."                                                                   |
| REQ-H5      | "Where our data is actually fully anonomous, this shouldn't be required. Would be a good thing to implement at some point, but not necessary now." |
| REQ-M1      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-M2      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-M3      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-M4      | "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality." |
| REQ-M5      | "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality." |
| REQ-M6      | "I want to make this feature as easy to use as possible."                                                           |
| REQ-M7      | "I want to make this feature as easy to use as possible."                                                           |
| REQ-M8      | "Using LSP, this should be pretty easy to navigate."                                                                   |
| REQ-M9      | "Using LSP, this should be pretty easy to navigate."                                                                   |
| REQ-M10     | "Where our data is actually fully anonomous, this shouldn't be required. Would be a good thing to implement at some point, but not necessary now." |
| REQ-L1      | "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality." |
| REQ-L2      | "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality." |
| REQ-L3      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L4      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L5      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L6      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L7      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L8      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L9      | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L10     | "My thought is that this would fit into the other functionality that we already offer and should have a command and then all of the other ways to call it that we already have for all of the other functionality." |
| REQ-L11     | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L12     | "I want to make this feature as easy to use as possible."                                                           |
| REQ-L13     | "I would like to make a feature that allows a developer to see all of the upstream things that affect the value of a specific variable." |
| REQ-L14     | "I want to make this feature as easy to use as possible."                                                           |
| REQ-L15     | "Where our data is actually fully anonomous, this shouldn't be required. Would be a good thing to implement at some point, but not necessary now." |

