import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Gather package.json dependencies if present (for JS/TS).
 * For other languages, adapt to check e.g. requirements.txt, go.mod, etc.
 */
export function getPackageDependencies(languageId: string):
    | Record<string, string>
    | undefined {

    switch (languageId) {
        case 'javascript':
        case 'typescript':
            return getPackageDependenciesJS();
        case 'go':
            return getPackageDependenciesGo();
        case 'python':
            return getPackageDependenciesPython();
        case 'rust':
            return getPackageDependenciesRust();
        default:
            return undefined;
    }

}

function getPackageDependenciesJS(): Record<string, string> | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return undefined;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const pkgPath = path.join(rootPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return undefined;
    }

    try {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(content);
        return {
            ...pkgJson.dependencies,
            ...pkgJson.devDependencies,
        } as Record<string, string>;
    } catch (err) {
        return undefined;
    }
}

function getPackageDependenciesGo(): Record<string, string> | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return undefined;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const modPath = path.join(rootPath, 'go.mod');
    if (!fs.existsSync(modPath)) {
        return undefined;
    }

    try {
        const content = fs.readFileSync(modPath, 'utf-8');
        const lines = content.split('\n');
        const deps: Record<string, string> = {};
        for (const line of lines) {
            const parts = line.split(' ');
            if (parts.length >= 2) {
                deps[parts[0]] = parts[1];
            }
        }
        return deps;
    } catch (err) {
        return undefined;
    }
}

function getPackageDependenciesPython(): Record<string, string> | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return undefined;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const reqPath = path.join(rootPath, 'requirements.txt');
    if (!fs.existsSync(reqPath)) {
        return undefined;
    }

    try {
        const content = fs.readFileSync(reqPath, 'utf-8');
        const lines = content.split('\n');
        const deps: Record<string, string> = {};
        for (const line of lines) {
            const parts = line.split('==');
            if (parts.length >= 2) {
                deps[parts[0]] = parts[1];
            }
        }
        return deps;
    } catch (err) {
        return undefined;
    }
}

function getPackageDependenciesRust(): Record<string, string> | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return undefined;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const tomlPath = path.join(rootPath, 'Cargo.toml');
    if (!fs.existsSync(tomlPath)) {
        return undefined;
    }

    try {
        const content = fs.readFileSync(tomlPath, 'utf-8');
        const deps: Record<string, string> = {};
        const toml = require('toml');
        const parsed = toml.parse(content);
        const dependencies = parsed.dependencies || {};
        for (const [name, version] of Object.entries(dependencies)) {
            deps[name] = version as string;
        }
        return deps;
    } catch (err) {
        return undefined;
    }
}