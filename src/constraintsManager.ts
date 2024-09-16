import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a constraint item in the Constraints TreeView.
 */
class ConstraintItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'constraintItem';
        this.iconPath = new vscode.ThemeIcon('symbol-parameter');
        if (command) {
            this.command = command;
        }
    }
}

/**
 * Provides data for the Constraints TreeView and updates constraints in the .prjinfo file.
 */
export class ConstraintsProvider implements vscode.TreeDataProvider<ConstraintItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConstraintItem | undefined | void> = new vscode.EventEmitter<ConstraintItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ConstraintItem | undefined | void> = this._onDidChangeTreeData.event;

    private constraints: string[] = [];
    private prjInfoPath: string = '';

    // List of supported constraint file extensions
    private supportedExtensions: string[] = ['.pcf', '.sdc'];

    constructor(private context: vscode.ExtensionContext) {
        // Load constraints initially
        this.loadConstraints();

        // Register commands
        this.registerCommands();
    }

    getTreeItem(element: ConstraintItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ConstraintItem): Thenable<ConstraintItem[]> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return Promise.resolve([]);  // No workspace, return empty array
        }

        const items: ConstraintItem[] = [];

        // Add an "Add Constraint" button at the top with a + icon
        const addConstraintItem = new ConstraintItem('Add Constraint', {
            command: 'constraints.addConstraint',
            title: 'Add Constraint'
        });
        addConstraintItem.iconPath = new vscode.ThemeIcon('add');  // Use the + icon
        items.push(addConstraintItem);  // Add this as the first item

        // Add the actual constraints below the "Add Constraint" button
        this.constraints.forEach(constraint => {
            items.push(new ConstraintItem(constraint, {
                command: 'constraints.openConstraint',
                title: 'Open Constraint',
                arguments: [constraint]
            }));
        });

        return Promise.resolve(items);
    }

    /**
     * Creates a new .prjinfo file with an empty constraints list.
     */
    private createNewPrjInfo(projectRoot: string) {
        const prjInfo = {
            projectRoot: projectRoot,
            constraints: []  // Empty constraints list initially
        };

        fs.writeFileSync(this.prjInfoPath, JSON.stringify(prjInfo, null, 2), 'utf-8');
    }

    /**
     * Loads constraints from the .prjinfo file.
     */
    private loadConstraints() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        this.prjInfoPath = path.join(workspaceFolder.uri.fsPath, '.prjinfo');
        if (fs.existsSync(this.prjInfoPath)) {
            const content = fs.readFileSync(this.prjInfoPath, 'utf-8');
            const prjInfo = JSON.parse(content);
            this.constraints = prjInfo.constraints || [];
        } else {
            // Create a new .prjinfo file if it doesn't exist
            this.createNewPrjInfo(workspaceFolder.uri.fsPath);
        }
        this.refresh();
    }

    /**
     * Merges constraints with the existing .prjinfo data without overwriting other sections.
     */
    private saveConstraints() {
        if (!this.prjInfoPath) {
            vscode.window.showErrorMessage('Project info file not found.');
            return;
        }

        let prjInfo = {};
        if (fs.existsSync(this.prjInfoPath)) {
            const content = fs.readFileSync(this.prjInfoPath, 'utf-8');
            prjInfo = JSON.parse(content);
        }

        // Merge the constraints with existing data in .prjinfo (keeping other sections intact)
        const updatedPrjInfo = {
            ...prjInfo,
            constraints: this.constraints
        };

        // Save the updated .prjinfo file
        fs.writeFileSync(this.prjInfoPath, JSON.stringify(updatedPrjInfo, null, 2), 'utf-8');
        vscode.window.showInformationMessage(`Project updated with ${this.constraints.length} constraints.`);
    }

    /**
     * Adds a new constraint and updates the .prjinfo file.
     * Only supports constraints with defined extensions.
     */
    async addConstraint() {
        const constraintFile = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select Constraint File'
        });

        if (constraintFile && constraintFile[0]) {
            const constraintPath = path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, constraintFile[0].fsPath);
            const extension = path.extname(constraintFile[0].fsPath);

            // Validate the file extension before adding
            if (this.supportedExtensions.includes(extension.toLowerCase())) {
                // Check if the constraint already exists
                if (!this.constraints.includes(constraintFile[0].fsPath)) {
                    this.constraints.push(constraintFile[0].fsPath);  // Use full path in .prjinfo
                    this.saveConstraints();  // Save updated constraints to .prjinfo
                    this.refresh();
                    vscode.window.showInformationMessage(`Constraint '${constraintPath}' added.`);
                } else {
                    vscode.window.showWarningMessage(`Constraint '${constraintPath}' already exists.`);
                }
            } else {
                vscode.window.showErrorMessage(`Unsupported constraint file extension: ${extension}. Allowed extensions are: ${this.supportedExtensions.join(', ')}`);
            }
        }
    }

    /**
     * Removes a constraint and updates the .prjinfo file.
     */
    removeConstraint(constraint: ConstraintItem) {
        const index = this.constraints.indexOf(constraint.label);
        if (index > -1) {
            this.constraints.splice(index, 1);
            this.saveConstraints();  // Save updated constraints to .prjinfo
            this.refresh();
            vscode.window.showInformationMessage(`Constraint '${constraint}' has been removed.`);
        } else {
            vscode.window.showErrorMessage(`Constraint '${constraint}' not found.`);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private registerCommands() {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('constraints.addConstraint', async () => {
                await this.addConstraint();
            }),
            vscode.commands.registerCommand('constraints.removeConstraint', async (constraint: ConstraintItem) => {
                this.removeConstraint(constraint);
            }),
            vscode.commands.registerCommand('constraints.refreshConstraints', () => {
                this.loadConstraints();
            }),
            vscode.commands.registerCommand('constraints.openConstraint', async (constraint: string) => {
                const workspaceFolder = vscode.workspace.workspaceFolders![0];
                const constraintUri = vscode.Uri.joinPath(workspaceFolder.uri, constraint);
                const document = await vscode.workspace.openTextDocument(constraintUri);
                await vscode.window.showTextDocument(document);
            })
        );
    }
}
