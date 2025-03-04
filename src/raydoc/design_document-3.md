Okay, here is the completed design document for the Variable Upstream Tracking feature, incorporating the detailed codebase description, previous analyses, requirements document, and design document template.

# Variable Upstream Tracking Design Document

## Current Context

The Raydoc Context VS Code extension assists developers by gathering relevant code context and leveraging an LLM to generate feature requirements and design documents. Key components include a context gathering layer, an LLM interaction layer, and an output/presentation layer.

Current pain points addressed by the feature:

*   Difficulty understanding the flow of data and dependencies within a codebase, especially for complex projects.
*   Manual effort required to trace the origin and modifications of a variable's value.

## Requirements

### Functional Requirements

*   **FR1:** The feature must allow users to select a variable within the workspace to initiate the upstream tracing process.
*   **FR2:** The feature must identify all assignments and modifications to the selected variable within the workspace.
*   **FR3:** The feature must display the chain of dependencies leading to the selected variable's value, showing the origin and any intermediate calculations or assignments in a hierarchical format.
*   **FR4:** The feature must be accessible via a VS Code command, a context menu option, and potentially a hover provider.
*   **FR5:** The feature must generate a human-readable string representation of the dependency tree that includes a warning if circular dependencies are detected.
*   **FR6:** Given the variable, the feature must be able to use the TypeScript compiler to find its definition (if there is one) and usages.
*   **FR7:** Given a TypeScript source code file, the feature must be able to parse it using the TypeScript AST parser and walk through the AST to identify assignment statements, function calls, and other relevant code elements that affect the variable's value.

### Non-Functional Requirements

*   **NFR1:** The feature must perform efficiently, minimizing the impact on the user's workflow. Caching should be implemented where appropriate.
*   **NFR2:** The feature must provide clear and informative error messages when encountering issues such as parsing errors or unsupported code constructs.
*   **NFR3:** The feature should integrate with the existing telemetry framework without requiring immediate explicit consent for anonymous data collection.
*   **NFR4:** The feature should not block the UI thread. All potentially long-running operations must be performed asynchronously.
*   **NFR5:** The feature should handle large files gracefully, avoiding excessive memory consumption or performance degradation.
*   **NFR6:** The feature should be configurable, allowing users to control the scope, depth, and LLM usage of the dependency tracing.
*   **NFR7:** The feature must have a clear separation of concerns to facilitate maintainability and testability.

## Design Decisions

### 1. Dependency Tracing Implementation
Will implement the dependency tracing logic within a new `DependencyTracer` class in `dependencyTracer.ts` using the TypeScript AST because:
*   **Rationale 1:** This allows us to leverage the power and accuracy of the TypeScript compiler for code analysis.
*   **Rationale 2:** Using the AST provides fine-grained control over the analysis process and allows us to handle various code constructs, like assignment operators, function calls, and data structures.
*   **Trade-offs considered:** Using LSP was considered, but the synchronous nature of the AST-based approach avoids asynchronous complexities and improves initial performance.  Reliance on the AST means we have to handle parsing errors, which will be solved via graceful degradation.

### 2. LLM Usage
Will use the LLM (Gemini) *only* for summarizing the dependency tree after it has been accurately gathered through code analysis because:
*   **Rationale 1:** The LLM can provide a natural language explanation of the dependencies, making it easier for developers to understand the code flow.
*   **Rationale 2:** Relying on the LLM *solely* for analysis would be expensive and less reliable. Direct code analysis techniques offer better performance and accuracy for simple cases.
*   **Alternatives considered:** Using the LLM for analysis, and the decision was made to analyze the code first, before using the LLM to summarize.

### 3. Data Structure for Dependency Tree
Will use a `DependencyNode` data structure in `types.ts` to represent the dependency tree because:
*   **Rationale 1:** A tree structure is well-suited for representing hierarchical relationships between variables and their dependencies.
*   **Rationale 2:** This structure allows us to easily traverse and format the dependency information for display.
*   **Alternatives considered:** A flat list or a graph database could be used, but a tree is more efficient for the common case of non-cyclic dependencies and easier to display.

### 4. Error Handling
Will implement robust error handling in `dependencyTracer.ts` to gracefully handle cases where the AST parser fails or when unexpected code constructs are encountered because:
*   **Rationale 1:** Prevent crashes and provide informative error messages
*   **Rationale 2:** It is impossible to guarantee that the code being analyzed is correct or even valid Typescript.

### 5. Performance
Will implement a caching mechanism to cache the results of AST parsing and dependency analysis because:
*   **Rationale 1:** This can significantly improve performance, especially for large codebases.
*   **Rationale 2:** The cached data can be invalidated when files are modified, ensuring that the results are always up-to-date.
*   **Alternatives considered:** No caching was considered, and the results are that caching should be used.

## Technical Design

### 1. Core Components
```typescript
// Key interfaces/classes with type hints
import * as ts from 'typescript';
import * as vscode from 'vscode';

interface DependencyNode {
    name: string;
    value: string;
    location: { uri: string; range: vscode.Range };
    children: DependencyNode[];
    circularDependency?: boolean; // Flag to indicate circular dependency
}

class DependencyTracer {
    private readonly visitedNodes = new Set<ts.Node>();

    constructor() {
    }

    public async trace(document: vscode.TextDocument, variableName: string, position: vscode.Position): Promise<DependencyNode | undefined> {
        const filePath = document.uri.fsPath;
        const sourceFile = ts.createSourceFile(
            filePath,
            document.getText(),
            ts.ScriptTarget.ESNext,
            true,
            ts.ScriptKind.TS
        );

        let targetNode: ts.Node | undefined;
        function findNode(node: ts.Node): void {
            if (node.getStart() <= document.offsetAt(position) && node.getEnd() >= document.offsetAt(position)) {
                targetNode = node;
            }
            node.forEachChild(findNode);
        }

        findNode(sourceFile);

        if (!targetNode) {
            vscode.window.showErrorMessage("Could not find node at cursor position.");
            return undefined;
        }

        // You might want to add more specific type checks here, e.g., is it an Identifier?
        if (!ts.isIdentifier(targetNode)) {
            vscode.window.showErrorMessage("Selected element is not a variable.");
            return undefined;
        }

        const definition = this.findVariableDefinition(variableName, filePath);

        if (!definition) {
            vscode.window.showErrorMessage(`Definition of variable "${variableName}" not found.`);
            return undefined;
        }

        return this.resolveVariable(sourceFile, targetNode as ts.Identifier, filePath);
    }

    private findVariableDefinition(variableName: string, filePath: string): { uri: string; range: vscode.Range } | undefined {
        const document = vscode.workspace.openTextDocument(filePath);
        const sourceFile = ts.createSourceFile(
            filePath,
            (await document).getText(),
            ts.ScriptTarget.ESNext,
            true,
            ts.ScriptKind.TS
        );

        let definitionNode: ts.Node | undefined;
        function findDefinition(node: ts.Node): void {
            if (ts.isVariableDeclaration(node) && node.name.getText() === variableName) {
                definitionNode = node;
            } else if (ts.isFunctionDeclaration(node) && node.name?.getText() === variableName) {
                definitionNode = node;
            } else {
                node.forEachChild(findDefinition);
            }
        }
        findDefinition(sourceFile);

        if (definitionNode) {
            return {
                uri: filePath,
                range: {
                    start: sourceFile.getLineAndCharacterOfPosition(definitionNode.getStart()).line,
                    end: sourceFile.getLineAndCharacterOfPosition(definitionNode.getEnd()).line,
                } as any
            }
        }
        return undefined;
    }

    private resolveVariable(sourceFile: ts.SourceFile, identifierNode: ts.Identifier, filePath: string): DependencyNode {
        const variableName = identifierNode.text;

        let assignments: DependencyNode[] = [];

        function visit(node: ts.Node) {
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                if (ts.isIdentifier(node.left) && node.left.text === variableName) {
                    const right = node.right;
                    let value = '';
                    if (ts.isStringLiteral(right)) {
                        value = right.text;
                    } else if (ts.isNumericLiteral(right)) {
                        value = right.text;
                    } else if (ts.isIdentifier(right)) {
                        value = right.text;
                    } else {
                        value = 'Expression';
                    }

                    assignments.push({
                        name: variableName,
                        value: value,
                        location: {
                            uri: filePath,
                            range: {
                                start: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line,
                                end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line,
                            } as any
                        },
                        children: []
                    });
                }
            } else {
                node.forEachChild(visit);
            }
        }
        visit(sourceFile);
        return assignments[0];
    }
}
```

### 2. Data Models
```typescript
// Key data models with type hints
interface RaydocContext {
    fileTree?: string;
    selectedCode?: string;
    dependencyTree?: DependencyNode; // Added for this feature
}
```

### 3. Integration Points

*   **VS Code Command:** A new command `raydoc.traceVariableUpstream` will be registered in `extension.ts` that calls the `DependencyTracer.trace()` method.
*   **Context Menu:** A context menu option "Trace Variable Upstream" will be added to the editor context menu.
*   **RaydocContext:** The `RaydocContext` interface will be extended with a `dependencyTree?: DependencyNode` property.
*   **toString.ts:** The `toString` function will be updated to format the `DependencyNode` tree.
*   **Telemetry:** Implement telemetry data collection using current practices

## Implementation Plan

1.  Phase 1: Initial Implementation (2 weeks)
    *   Task 1: Implement `DependencyTracer` class with `trace` method.
    *   Task 2: Implement `findVariableDefinition` and `resolveVariable` functions using the AST.
    *   Task 3: Implement VS Code command and context menu integration.
    *   Task 4: Implement basic output formatting in `toString.ts`.
    *   Expected timeline: 2 weeks

2.  Phase 2: Enhancement Phase (2 weeks)
    *   Task 1: Add support for imports and multiple files.
    *   Task 2: Add support for different assignment operators.
    *   Task 3: Add basic control flow analysis (if statements, loops).
    *   Task 4: Implement caching and performance optimizations.
    *   Expected timeline: 2 weeks

3.  Phase 3: Production Readiness (1 week)
    *   Task 1: Implement error handling and logging.
    *   Task 2: Implement telemetry data collection.
    *   Task 3: Add configuration settings for scope, depth, and LLM usage.
    *   Task 4: Thorough testing and documentation.
    *   Expected timeline: 1 week

## Testing Strategy

### Unit Tests

*   Key test cases:
    *   Tracing a variable with a direct assignment.
    *   Tracing a variable with an assignment from another variable.
    *   Tracing a variable with an assignment from a function call.
    *   Tracing a variable with a circular dependency.
*   Mock strategies:
    *   Mock the VS Code API.
    *   Mock the TypeScript compiler API.
*   Coverage expectations:
    *   Aim for 80% code coverage.

### Integration Tests

*   Test scenarios:
    *   Tracing a variable across multiple files.
    *   Tracing a variable with complex control flow.
    *   Tracing a variable in a large codebase.
*   Environment needs:
    *   VS Code instance with the Raydoc Context extension installed.
    *   A sample TypeScript project with various code constructs.
*   Data requirements:
    *   Sample TypeScript files with various variable assignments and dependencies.

## Observability

### Logging

*   Key logging points:
    *   Entering and exiting the `trace` method.
    *   Finding variable definitions and assignments.
    *   Resolving assignments.
    *   Encountering errors or exceptions.
*   Log levels:
    *   Use `INFO` for normal operations.
    *   Use `WARN` for potential issues.
    *   Use `ERROR` for critical errors.
*   Structured logging format:
    *   Use a JSON format with timestamps, log levels, and relevant data.

### Metrics

*   Key metrics to track:
    *   Execution time of the `trace` method.
    *   Number of variable definitions and assignments found.
    *   Number of errors encountered.
*   Collection method:
    *   Use the VS Code telemetry API to collect metrics.
*   Alert thresholds:
    *   Set alerts for excessive execution times or error rates.

## Future Considerations

### Potential Enhancements

*   Add support for data structure dependencies (tracing how a specific field of an object gets its value).
*   Add support for dynamic dispatch/polymorphism (using the LLM to analyze potential code paths).
*   Add support for side effects (tracking if a function modifies a global variable that affects the value of the target variable).
*   Implement a custom visualization of the dependency tree (e.g., using a graph visualization library).
*   Use the LLM to create "code recipes" with the dependencies.

### Known Limitations

*   The initial implementation only supports direct assignments and literal values within a single file.
*   The AST parser may fail on invalid or unsupported code constructs.
*   Performance may be an issue for very large codebases.
*   It is not guaranteed that the code will compile, which will break the system.

## Dependencies

### Runtime Dependencies

*   `typescript`: Required for parsing and analyzing TypeScript code.
*   `vscode`: Required for interacting with the VS Code API.

### Development Dependencies

*   `typescript`: Required for compiling the extension code.
*   `vscode`: Required for developing and testing the extension.
*   `jest`: Test framework

## Security Considerations

*   The extension does not handle user authentication or authorization.
*   The extension does not store any sensitive data.
*   The extension relies on the TypeScript compiler API and the VS Code API, which are assumed to be secure.

## Rollout Strategy

1.  Development phase: Implement the core functionality and conduct unit tests.
2.  Testing phase: Conduct integration tests and user acceptance testing.
3.  Staging deployment: Deploy the extension to a staging environment for further testing.
4.  Production deployment: Deploy the extension to the VS Code Marketplace.
5.  Monitoring period: Monitor the extension for errors and performance issues after deployment.

## References

*   [TypeScript Compiler API Documentation](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
*   [VS Code API Documentation](https://code.visualstudio.com/api)

This design document provides a comprehensive guide for implementing the Variable Upstream Tracking feature in the Raydoc Context VS Code extension. By following the design decisions, technical specifications, and implementation plan outlined in this document, developers can create a valuable tool for understanding code dependencies and improving developer productivity.
