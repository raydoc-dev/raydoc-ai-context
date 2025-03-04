import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';
import { contextToString, contextToStringLlm } from './toString';
import { gatherContext } from './context';
import { getFunctionDefinition } from './functions';
import { FunctionDefinition } from './types';
import { v4 as uuidv4 } from 'uuid';

let analyticsClient: PostHog;
let userId: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    analyticsClient = new PostHog(
        'phc_Rv9pNJA7chv1QR27K0jg2s1Bwah2PDsZroMEI1Usic7',
        { host: 'https://us.i.posthog.com' }
    );

    const USER_ID_KEY = 'RaydocUserId';

    // Retrieve the stored UUID
    userId = context.globalState.get<string>(USER_ID_KEY);

    // If UUID doesn't exist, generate and store it
    if (!userId) {
        userId = uuidv4();
        context.globalState.update(USER_ID_KEY, userId);

        // This is the first time the extension is being used, we can also check to see if we are using Cursor
        // Automatically detect if we're running in Cursor
        const isCursorDetected = isCursor();

        // Get the configuration and update it based on detection
        const config = vscode.workspace.getConfiguration('raydoc-context');

        // Only update the configuration if it doesn't match what we detected
        if (config.get<boolean>('use-cursor', false) !== isCursorDetected) {
            // Update the configuration to match the detected editor
            (async () => {
                try {
                    await config.update('use-cursor', isCursorDetected, vscode.ConfigurationTarget.Global);
                    console.log(`Automatically set use-cursor to ${isCursorDetected} based on detection`);
                } catch (err: unknown) {
                    console.error('Failed to update use-cursor setting:', err);
                }
            })();
        }
    }

    // Register commands with direct handler references
    const copyContextAtCursorCommand = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursor',
        (positionArg?: { uri: string, line: number, character: number }) => copyContextAtCursorCommandHandler(positionArg)
    );

    const copyFromMenu = vscode.commands.registerCommand(
        'raydoc-context.copyContextAtCursorWithoutPosition',
        () => copyContextAtCursorCommandHandler()
    );

    const sendContextToLlmCommand = vscode.commands.registerCommand(
        'raydoc-context.sendContextToLlm',
        (positionArg?: { uri: string, line: number, character: number }) => sendContextToLlmCommandHandler(positionArg)
    );

    const sendFromMenu = vscode.commands.registerCommand(
        'raydoc-context.sendContextToLlmWithoutPosition',
        () => sendContextToLlmCommandHandler()
    );

    // Register the code action provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        { scheme: 'file', pattern: '**/*' }, // Match all files
        new RaydocCodeActionProvider(),
        {
            providedCodeActionKinds: RaydocCodeActionProvider.providedCodeActionKinds
        }
    );

    context.subscriptions.push(
        copyContextAtCursorCommand,
        copyFromMenu,
        sendContextToLlmCommand,
        sendFromMenu,
    );
}

class RaydocCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        // Extract the position from the range (start position)
        const positionArg = {
            uri: document.uri.toString(),
            line: range.start.line,
            character: range.start.character
        };

        // Encode arguments as a JSON string for VS Code command execution
        const args = [positionArg];

        const copyAction = new vscode.CodeAction(
            'Copy AI Context at Cursor',
            vscode.CodeActionKind.QuickFix
        );
        copyAction.command = {
            command: 'raydoc-context.copyContextAtCursor',
            title: 'Copy AI Context at Cursor',
            arguments: args // Pass position argument
        };

        const sendAction = new vscode.CodeAction(
            'Send Context to LLM',
            vscode.CodeActionKind.QuickFix
        );
        sendAction.command = {
            command: 'raydoc-context.sendContextToLlm',
            title: 'Send Context to Cursor Composer or Copilot Chat',
            arguments: args // Pass position argument
        };

        return [copyAction, sendAction];
    }
}

export function deactivate() {
    analyticsClient.shutdown();
}

function isSelectionEmpty(selection: vscode.Selection): boolean {
    return selection.start.line === selection.end.line &&
        selection.start.character === selection.end.character;
}

async function copyContextAtCursorCommandHandler(positionArg?: { uri: string, line: number, character: number }) {
    const editor = vscode.window.activeTextEditor;

    let doc: vscode.TextDocument;
    let selection: vscode.Selection;
    let diag: vscode.Diagnostic | undefined;

    if (positionArg) {
        // If triggered via code action or hover, we have a position
        const uri = vscode.Uri.parse(positionArg.uri);
        doc = await vscode.workspace.openTextDocument(uri);
        const pos = new vscode.Position(positionArg.line, positionArg.character);
        // Construct a single-cursor selection if we only have a position
        selection = new vscode.Selection(pos, pos);
        // Find any diagnostic that covers this position
        const allDiagnostics = vscode.languages.getDiagnostics(doc.uri);
        diag = allDiagnostics.find(d => d.range.contains(pos));
    } else {
        // Use the user's current selection
        if (!editor) {
            vscode.window.setStatusBarMessage('No active text editor.', 3000);
            return;
        }
        doc = editor.document;
        selection = editor.selection;
        // If we want to pick a diagnostic for the start of the selection
        const allDiagnostics = vscode.languages.getDiagnostics(doc.uri);
        diag = allDiagnostics.find(d => d.range.contains(selection.start));
    }

    const context = await gatherContext(doc, selection, diag);
    if (!context) {
        vscode.window.showErrorMessage('No context found for the current cursor position.');
        sendPHEvent(doc, 'no-context-found-at-cursor');
        return;
    }

    const output = contextToString(context) + '---\n\n\n';
    if (output) {
        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage('Raydoc: context copied to clipboard!');
        sendPHEvent(doc, 'context-copied');
    } else {
        vscode.window.showWarningMessage('No context available to copy.');
        sendPHEvent(doc, 'no-context-available');
    }
}

async function sendContextToLlmCommandHandler(
    positionArg?: { uri: string, line: number, character: number }
) {
    const editor = vscode.window.activeTextEditor;

    // 1) Determine document & selection
    let doc: vscode.TextDocument;
    let originalSelection: vscode.Selection;

    if (positionArg) {
        // Triggered via hover/code action: single cursor
        const uri = vscode.Uri.parse(positionArg.uri);
        doc = await vscode.workspace.openTextDocument(uri);
        const pos = new vscode.Position(positionArg.line, positionArg.character);
        originalSelection = new vscode.Selection(pos, pos);
    } else {
        // Triggered manually: use the user's current selection (could be multi-line or cursor)
        if (!editor) {
            vscode.window.setStatusBarMessage('No active text editor.', 3000);
            return;
        }
        doc = editor.document;
        originalSelection = editor.selection;
    }

    // --- 2) Gather context for the selection (could be single or multiple functions) ---
    const context = await gatherContext(doc, originalSelection, undefined);
    if (!context) {
        vscode.window.setStatusBarMessage('No function(s) found at the current selection/cursor.', 3000);
        // Optional analytics
        sendPHEvent(doc, 'no-functions-found');
        return;
    }

    // 3) Send each main function + references/types to the LLM
    const config = vscode.workspace.getConfiguration('raydoc-context');
    const useCursor = config.get<boolean>('use-cursor', false);

    for (const fnDef of context.functionDefns || []) {
        await selectAndSendToLlm(fnDef, useCursor);
    }
    for (const typeDefn of context.typeDefns || []) {
        await selectAndSendToLlm(typeDefn, useCursor);
    }
    for (const referencedFunction of context.referencedFunctions || []) {
        await selectAndSendToLlm(referencedFunction, useCursor);
    }

    // 4) Re-focus the original document & restore the original selection
    const newEditor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    newEditor.selection = originalSelection;

    // 5) Copy minimal LLM context to clipboard
    const output = contextToStringLlm(context) + '---\n\n\n';
    await vscode.env.clipboard.writeText(output);

    vscode.window.setStatusBarMessage('Raydoc: context copied to clipboard and sent to LLM!', 2000);

    // --- 6) Analytics (optional) ---
    sendPHEvent(doc, 'context-sent-to-llm');
}

async function selectAndSendToLlm(functionDefinition: FunctionDefinition, useCursor: boolean) {
    // Get the file URI from the function definition (relative to the workspace root)
    const fullFilePath = vscode.workspace.workspaceFolders
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, functionDefinition.filename).fsPath
        : functionDefinition.filename; // Fallback if workspace is not open

    const fileUri = vscode.Uri.file(fullFilePath);

    // Open the document
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

    // Get function range (you should implement this based on your logic)
    let functionRange = getSelectionFromFunctionDefinition(doc, functionDefinition);

    // Apply the selection
    editor.selection = functionRange;

    // Attach the selection to the LLM
    if (!useCursor) {
        await vscode.commands.executeCommand("github.copilot.chat.attachSelection");
    } else {
        await vscode.commands.executeCommand("composer.startComposerPrompt");
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait because cursor was sometimes not adding everything
    }
}

function getSelectionFromFunctionDefinition(doc: vscode.TextDocument, functionDefinition: FunctionDefinition): vscode.Selection {
    return new vscode.Selection(
        new vscode.Position(functionDefinition.startLine, 0),
        new vscode.Position(functionDefinition.endLine, doc.lineAt(functionDefinition.endLine).text.length)
    );
}

async function getFunctionsInSelection(
    doc: vscode.TextDocument,
    selection: vscode.Selection
): Promise<FunctionDefinition[]> {
    const foundFunctions: FunctionDefinition[] = [];

    // We take every line in the selection
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    for (let line = startLine; line <= endLine; line++) {
        // We try a position at column 0, but you could also iterate columns if needed
        const position = new vscode.Position(line, 0);
        const fnDef = await getFunctionDefinition(doc, position, false, true);

        if (fnDef) {
            // Avoid duplicates
            const signature = `${fnDef.functionName}:${fnDef.startLine}:${fnDef.endLine}:${fnDef.filename}`;
            if (!foundFunctions.some(f =>
                `${f.functionName}:${f.startLine}:${f.endLine}:${f.filename}` === signature)) {
                foundFunctions.push(fnDef);
            }
        }
    }

    return foundFunctions;
}

function isCursor(): boolean {
    // Check the application name
    const appName = vscode.env.appName;

    // Cursor will have "Cursor" in its application name
    return appName.includes('Cursor');
}

function sendPHEvent(doc: vscode.TextDocument, eventName: string) {
    const extension = vscode.extensions.getExtension('raydoc.raydoc-ai-context');
    const raydocVersion = extension?.packageJSON.version || 'unknown';
    userId && analyticsClient.capture({
        distinctId: userId,
        event: eventName,
        properties: {
            languageId: doc.languageId,
            raydocVersion: raydocVersion,
            isCursor: isCursor(),
            editorVersion: vscode.version,
            isDev: process.env.VSCODE_DEBUG_MODE === 'true'
        }
    });
}
