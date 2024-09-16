import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ExecutionManager implements vscode.TreeDataProvider<ExecutionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ExecutionItem | undefined | void> = new vscode.EventEmitter<ExecutionItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ExecutionItem | undefined | void> = this._onDidChangeTreeData.event;

    private prjInfoWatcher: vscode.FileSystemWatcher | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.initializeWatcher();
    }

    getTreeItem(element: ExecutionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ExecutionItem): Thenable<ExecutionItem[]> {
        const items: ExecutionItem[] = [];
        return Promise.resolve(items);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private initializeWatcher() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const prjInfoPath = path.join(workspaceFolder.uri.fsPath, '.prjinfo');
        this.prjInfoWatcher = vscode.workspace.createFileSystemWatcher(prjInfoPath);

        this.prjInfoWatcher.onDidChange(() => this.generateMakefile());
        this.prjInfoWatcher.onDidCreate(() => this.generateMakefile());
        this.prjInfoWatcher.onDidDelete(() => this.generateMakefile());
    }

    /**
     * Generates a Makefile based on the content of the .prjinfo file.
     */
    async generateMakefile() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const prjInfoPath = path.join(workspaceFolder.uri.fsPath, '.prjinfo');
        if (!fs.existsSync(prjInfoPath)) {
            vscode.window.showErrorMessage('.prjinfo file not found.');
            return;
        }

        const prjInfoContent = fs.readFileSync(prjInfoPath, 'utf-8');
        let prjInfo;
        try {
            prjInfo = JSON.parse(prjInfoContent);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to parse .prjinfo file.');
            return;
        }

        // Extract necessary data from the .prjinfo file
        const constraints = prjInfo.constraints || [];
        const sources = prjInfo.sourceFiles || [];

        // Create Makefile content based on the parsed data
        const makefileContent = `
# Automatically generated Makefile
# Sources: ${sources.join(' ')}
# Constraints: ${constraints.join(' ')}

all: main

main: ${sources.join(' ')}
\t@echo "Building project with sources: ${sources.join(' ')}"

clean:
\t@echo "Cleaning up..."
\t@rm -f main
        `;

        const makefilePath = path.join(workspaceFolder.uri.fsPath, 'Makefile');
        fs.writeFileSync(makefilePath, makefileContent, 'utf-8');
        vscode.window.showInformationMessage('Makefile has been generated based on .prjinfo content.');
    }
}

class ExecutionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
