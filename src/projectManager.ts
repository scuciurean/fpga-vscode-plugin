import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ProjectManager implements vscode.TreeDataProvider<ProjectItem> {
    private prjInfoPath: string = '';
    private sourceFiles: string[] = [];
    private watcher: vscode.FileSystemWatcher | undefined;
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | void> = new vscode.EventEmitter<ProjectItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;
    
    private excludeFolders: string[] = ['build', 'docs', 'test'];

    constructor(private context: vscode.ExtensionContext) {
        this.loadProjectInfo();  // Load project info and source files on startup
        this.initializeFileWatcher();  // Initialize the file watcher

        // Register the refresh command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('projectManager.refreshProject', () => {
                this.refreshProject();  // Call the method to refresh the project
            })
        );
    }

    /**
     * Method to refresh the project tree view by reloading the project info and source files.
     */
    private refreshProject() {
        vscode.window.showInformationMessage('Refreshing project...');
        this.loadProjectInfo();  // Reload project information and update the view
        this._onDidChangeTreeData.fire();  // Trigger an update in the TreeView
    }

    /**
     * Loads project information and source files from the .prjinfo file.
     */
    private loadProjectInfo() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        this.prjInfoPath = path.join(workspaceFolder.uri.fsPath, '.prjinfo');
        if (fs.existsSync(this.prjInfoPath)) {
            const content = fs.readFileSync(this.prjInfoPath, 'utf-8');
            const prjInfo = JSON.parse(content);

            // Load project root and source files from .prjinfo
            const projectRoot = prjInfo.projectRoot || workspaceFolder.uri.fsPath;
            this.sourceFiles = prjInfo.sourceFiles || this.findSourceFiles(projectRoot);  // Load or find files

            vscode.window.showInformationMessage(`Project loaded with root: ${projectRoot}`);
        } else {
            this.createNewPrjInfo(workspaceFolder.uri.fsPath);  // Create new .prjinfo if not found
        }

        // Always make sure to load the latest source files at startup
        this.sourceFiles = this.findSourceFiles(workspaceFolder.uri.fsPath);
        this.saveProjectInfo();  // Save any newly found source files
    }

    /**
     * Creates a new .prjinfo file with the project root and source files.
     */
    private createNewPrjInfo(projectRoot: string) {
        this.sourceFiles = this.findSourceFiles(projectRoot);

        const prjInfo = {
            projectRoot: projectRoot,
            sourceFiles: this.sourceFiles
        };

        fs.writeFileSync(this.prjInfoPath, JSON.stringify(prjInfo, null, 2), 'utf-8');
        vscode.window.showInformationMessage(`New project created at: ${projectRoot}`);
    }

    /**
     * Finds all HDL source files (.v, .vhd, .sv) in the project.
     */
    private findSourceFiles(dir: string): string[] {
        const extensions = ['.v', '.vhd', '.sv'];
        let files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
    
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
    
            if (entry.isDirectory()) {
                // Exclude directories that are in the excludeFolders list
                const relativeDir = path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, fullPath).replace(/\\/g, '/');
                if (!this.excludeFolders.some(folder => relativeDir.startsWith(folder))) {
                    files = files.concat(this.findSourceFiles(fullPath));  // Recursively search subfolders
                }
            } else if (extensions.includes(path.extname(fullPath).toLowerCase())) {
                files.push(fullPath);  // Add file to the list
            }
        }
    
        return files;
    }
    
    /**
     * Initializes a FileSystemWatcher to watch for changes in .v, .vhd, .sv files.
     */
    private initializeFileWatcher() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        // Create a FileSystemWatcher for .v, .vhd, .sv files
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '**/*.{v,vhd,sv}')
        );

        // Watch for file creation
        this.watcher.onDidCreate((uri) => {
            this.handleFileChange(uri, 'create');
        });

        // Watch for file deletion
        this.watcher.onDidDelete((uri) => {
            this.handleFileChange(uri, 'delete');
        });

        // Watch for file rename/move
        this.watcher.onDidChange((uri) => {
            this.handleFileChange(uri, 'update');
        });
    }

    /**
     * Handles file changes (create, delete, update) and updates the .prjinfo file.
     */
    private handleFileChange(uri: vscode.Uri, changeType: 'create' | 'delete' | 'update') {
        const filePath = uri.fsPath;
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const relativeFilePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

        // Determine if the file is within an excluded folder
        const isExcluded = this.excludeFolders.some(folder => relativeFilePath.startsWith(folder));

        if (isExcluded) {
            return;  // Ignore changes in excluded folders
        }

        if (changeType === 'create') {
            if (!this.sourceFiles.includes(filePath)) {
                this.sourceFiles.push(filePath);
                vscode.window.showInformationMessage(`Added file: ${path.basename(filePath)}`);
            }
        } else if (changeType === 'delete') {
            const index = this.sourceFiles.indexOf(filePath);
            if (index > -1) {
                this.sourceFiles.splice(index, 1);
                vscode.window.showInformationMessage(`Removed file: ${path.basename(filePath)}`);
            }
        }

        this.saveProjectInfo();  // Update the .prjinfo file
    }

    /**
     * Saves the updated source file list to the .prjinfo file while preserving other data (e.g., constraints).
     */
    private saveProjectInfo() {
        if (!this.prjInfoPath) {
            vscode.window.showErrorMessage('Project info file not found.');
            return;
        }

        // Read the current .prjinfo file
        let prjInfo = {};
        if (fs.existsSync(this.prjInfoPath)) {
            const content = fs.readFileSync(this.prjInfoPath, 'utf-8');
            prjInfo = JSON.parse(content);
        }

        // Merge the sourceFiles with existing data in .prjinfo (keeping other sections intact)
        const updatedPrjInfo = {
            ...prjInfo,
            projectRoot: vscode.workspace.workspaceFolders![0].uri.fsPath,
            sourceFiles: this.sourceFiles
        };

        // Save the updated .prjinfo file
        fs.writeFileSync(this.prjInfoPath, JSON.stringify(updatedPrjInfo, null, 2), 'utf-8');
        vscode.window.showInformationMessage(`Project updated with ${this.sourceFiles.length} source files.`);
    }

    /**
     * Provide data for the TreeView.
     */
    getTreeItem(element: ProjectItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectItem): Thenable<ProjectItem[]> {
        if (!element) {
            // Return the root level items (source files)
            const items: ProjectItem[] = this.sourceFiles.map(filePath => {
                return new ProjectItem(path.basename(filePath), vscode.TreeItemCollapsibleState.None, filePath);
            });
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }
}

class ProjectItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath: string
    ) {
        super(label, collapsibleState);
        this.resourceUri = vscode.Uri.file(filePath);
    }
}
