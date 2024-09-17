import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

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
        const relativeSources = sources.map((source : string) => path.relative(workspaceFolder.uri.fsPath, source));
        const relativeConstraints = constraints.map((constraint : string) => path.relative(workspaceFolder.uri.fsPath, constraint));


        // Create Makefile content based on the parsed data
        const makefileContent = `
# Automatically generated Makefile

TOP_MODULE = top
SRCS = ${relativeSources.join(" \\\n\t")}
PCF = ${relativeConstraints}
SDC = 

QL_FLAGS= \\
	-d ql-eos-s3 \\
	-P PU64 \\
	-t top \\
	-v $(SRCS) \\
	-p $(PCF)

#    -s $(SDC)

all:
	ql_symbiflow -compile $(QL_FLAGS) -dump binary
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

export function runProject() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }

    const terminal = vscode.window.createTerminal('Build Project');
    terminal.show();

    // Define the command to set up the environment and run make
    const command = `
        export F4PGA_INSTALL_DIR=/opt/f4pga;
        export FPGA_FAM=eos-s3;
        source "$F4PGA_INSTALL_DIR/$FPGA_FAM/conda/etc/profile.d/conda.sh";
        conda activate eos-s3;
        make
    `;

    // Execute the command in the terminal
    terminal.sendText(command);
}