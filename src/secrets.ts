import * as vscode from 'vscode';

export async function getSecret(context: vscode.ExtensionContext, secretName: string): Promise<string | undefined> {
    // First, check the user's settings
    let secret = vscode.workspace.getConfiguration('raydoc-context.secrets').get<string>(secretName);
    if (secret) {
        await context.secrets.store(`raydoc-context.secrets.${secretName}`, secret);
        await vscode.workspace.getConfiguration('raydoc-context.secrets').update(secretName, undefined, vscode.ConfigurationTarget.Global);
        return secret;
    }

    // If not in settings, try to get the API key from secret storage
    secret = await context.secrets.get(`raydoc-context.secrets.${secretName}`);
    return secret;
}
