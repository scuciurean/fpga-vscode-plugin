import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
    
export interface ProjectInfo {
    projectRoot?: string;
    sourceFiles?: string[];
    constraints?: string[];
    topModule?: string;
}

export interface ProjectConfig {
    name: string;
    projectInfoPath: string;
    projectRoot: string;
    active: boolean;
    info: ProjectInfo;
}

export interface WorkspaceConfig {
    workspaceRoot: string;
    projects: ProjectConfig[];
}

export class ProjectItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath: string
    ) {
        super(label, collapsibleState);
        this.resourceUri = vscode.Uri.file(filePath);
        this.contextValue = 'projectItem'; // Set the context value for right-click menu options
    }
}

export class ProjectManager implements vscode.TreeDataProvider<ProjectItem> {
    private static _instance: ProjectManager | null = null;
    private currentActiveProject: ProjectConfig | null = null;
    public workspaceConfig: WorkspaceConfig | null = null;
    public excludeFolders: string[] = ['build'];
    private workspaceExtension: string = '.ews';
    private workspaceConfigPath: string = '';
    private sourceFiles: string[] = [];
    private watcher: vscode.FileSystemWatcher | undefined;
    private _onDidUpdateProject: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidUpdateProject: vscode.Event<void> = this._onDidUpdateProject.event;
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | void> = new vscode.EventEmitter<ProjectItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
        this.loadWorkspaceConfig();
        this.initializeFileWatcher();
        this.registerCommands();
        
        // Initialize the File Browser Provider
        const fileBrowserProvider = new FileBrowserProvider(context, this);
        vscode.window.registerTreeDataProvider('projectBrowserView', fileBrowserProvider);
    
        // Dispose of the provider when the extension is deactivated
        context.subscriptions.push(fileBrowserProvider);
    }
    
    public static get instance(): ProjectManager {
        if (!ProjectManager._instance) {
            throw new Error("ProjectManager not initialized. Call ProjectManager.initialize(context) first.");
        }
        return ProjectManager._instance;
    }

    public static initialize(context: vscode.ExtensionContext): void {
        if (!ProjectManager._instance) {
            ProjectManager._instance = new ProjectManager(context);
        }
    }


    public getActiveProject(): ProjectConfig | null {
        return this.currentActiveProject;
    }

    /**
     * Register the context commands
     */
    private registerCommands() {
        // Register the refresh command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('projectManager.refreshProjects', () => {
                this.refreshProjects();  // Call the method to refresh the project
            })
        );

        // Register enable/disable project commands
        this.context.subscriptions.push(
            vscode.commands.registerCommand('projectManager.enableProject', (item: ProjectItem) => {
                this.toggleProjectStatus(item, true);  // Enable the project
            }),
            vscode.commands.registerCommand('projectManager.disableProject', (item: ProjectItem) => {
                this.toggleProjectStatus(item, false);  // Disable the project
            })
        );
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
     * Load a project from the workspace configuration.
     */
    private loadProject(project: ProjectConfig) {
        if (fs.existsSync(project.projectInfoPath)) {
            const content = fs.readFileSync(project.projectInfoPath, 'utf-8');
            project.info = JSON.parse(content);
            vscode.window.showInformationMessage(`Project loaded: ${project.name}`);
        } else {
            vscode.window.showWarningMessage(`Project file not found: ${project.projectInfoPath}`);
        }
    }

    /**
     * Load all projects
     */
    private loadProjects() {
        if (!this.workspaceConfig) {
            vscode.window.showErrorMessage('Workspace configuration is not loaded.');
            return;
        }
    
        this.workspaceConfig.projects.forEach(project => this.loadProject(project));
        this.workspaceConfig.projects.forEach((project: any) => {
            if (project.active) {
                this.currentActiveProject = project;
            }
        });
    }

    /**
     * Load workspace configuration from .workspace file.
     */
    private loadWorkspaceConfig() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Workspace is not set.');
            return;
        }
    
        this.workspaceConfigPath = path.join(workspaceFolder.uri.fsPath, this.workspaceExtension);
        if (fs.existsSync(this.workspaceConfigPath)) {
            const content = fs.readFileSync(this.workspaceConfigPath, 'utf-8');
            this.workspaceConfig = JSON.parse(content);
            vscode.window.showInformationMessage('Workspace configuration loaded successfully.');
            this.loadProjects();  // Load projects from the workspace config
        } else {
            vscode.window.showWarningMessage('No .workspace file found.');
        }
    }

    /**
     * Saves the updated workspace configuration.
     */
    private saveWorkspaceConfig() {
        if (!this.workspaceConfigPath || !this.workspaceConfig) {
            vscode.window.showErrorMessage('Unable to save workspace configuration.');
            return;
        }

        fs.writeFileSync(this.workspaceConfigPath, JSON.stringify(this.workspaceConfig, null, 2), 'utf-8');
    }

    /**
     * Method to refresh the project tree view by reloading the project info and source files.
     */
    private refreshProjects() {
        vscode.window.showInformationMessage('Refreshing project...');
        this.loadProjects();  // Reload project information and update the view
        this._onDidChangeTreeData.fire();  // Trigger an update in the TreeView
    }

    /**
     * Toggles the active status of a project.
     */
    private toggleProjectStatus(item: ProjectItem, state: boolean) {
        if (!this.workspaceConfig) {
            vscode.window.showErrorMessage('Workspace configuration not loaded.');
            return;
        }
    
        const project = this.workspaceConfig.projects.find(p => p.name === item.label);
        if (project) {
            project.active = state;
    
            if (state) {
                // Disable all other projects when enabling the selected one
                this.workspaceConfig.projects.forEach(p => {
                    if (p.name !== project.name) {
                        p.active = false;
                    }
                });
                this.currentActiveProject = project;
                this._onDidUpdateProject.fire();
            }
    
            vscode.window.showInformationMessage(`Project ${project.name} has been ${state ? 'enabled' : 'disabled'}.`);
            this.saveWorkspaceConfig();
            this.refresh();
        }
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
        if (changeType === 'update') {
            return; // No specific action needed for updates in this case
        } else {
            // Find the project that this file belongs to
            const selectedProject = this.workspaceConfig?.projects.find(project => 
                project.projectRoot && filePath.startsWith(project.projectRoot)
            );
    
            if (selectedProject) {
                // Ensure sourceFiles array is initialized
                if (!selectedProject.info.sourceFiles) {
                    selectedProject.info.sourceFiles = [];
                }
    
                if (changeType === 'create') {
                    if (!selectedProject.info.sourceFiles.includes(filePath)) {
                        selectedProject.info.sourceFiles.push(filePath);
                        vscode.window.showInformationMessage(`Added file: ${path.basename(filePath)}`);
                    }
                } else if (changeType === 'delete') {
                    const index = selectedProject.info.sourceFiles.indexOf(filePath);
                    if (index > -1) {
                        selectedProject.info.sourceFiles.splice(index, 1);
                        vscode.window.showInformationMessage(`Removed file: ${path.basename(filePath)}`);
                    }
                }
                fs.writeFileSync(selectedProject.projectInfoPath, JSON.stringify(selectedProject.info, null, 2), 'utf-8');
                vscode.window.showInformationMessage(`Project '${selectedProject.name}' updated with ${selectedProject.info.sourceFiles?.length || 0} source files.`);
            }
        }
    }
    
    /**
     * Initializes a FileSystemWatcher to watch for changes in .v, .vhd, .sv files.
     */
    private initializeFileWatcher() {
        if (!this.workspaceConfig) {
            return;
        }
    
        // Dispose of any existing watcher before creating a new one
        if (this.watcher) {
            this.watcher.dispose();
        }
    
        // Watch all projects' root folders and subfolders
        this.workspaceConfig.projects.forEach(project => {
            if (project.projectRoot) {
                const projectRootUri = vscode.Uri.file(project.projectRoot);
    
                // Create a FileSystemWatcher for any files within the project root directory
                const watcherPattern = new vscode.RelativePattern(projectRootUri, '**/*.{v,vhd,sv}');
                this.watcher = vscode.workspace.createFileSystemWatcher(watcherPattern);
    
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
        });
    }

    getTreeItem(element: ProjectItem): vscode.TreeItem {
        if (element instanceof ProjectItem) {
            const workspaceConfig = this.workspaceConfig;
            if (workspaceConfig) {
                const project = workspaceConfig.projects.find(p => p.name === element.label);
                if (project) {
                    element.contextValue = project.active ? 'activeProject' : 'inactiveProject';
                }
            }
        }
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

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

export class FileBrowserItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.resourceUri = resourceUri;

        // Set the context value based on the item type
        if (this.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
            if (this.label === path.basename(this.resourceUri.fsPath) && this.resourceUri.fsPath === this.getWorkspaceRoot()?.fsPath) {
                // It's the root folder
                this.contextValue = 'fileBrowserRoot';
                // this.iconPath = new vscode.ThemeIcon('project'); // Set a default icon for project items
            } else {
                // It's a regular folder
                this.contextValue = 'fileBrowserFolder';
                this.iconPath = vscode.ThemeIcon.Folder;
            }
            this.iconPath = vscode.ThemeIcon.Folder;
        } else if (this.label === 'No items to display') {
            // Placeholder item
            this.contextValue = 'fileBrowserPlaceholder';
            this.iconPath = new vscode.ThemeIcon('info');
        } else {
            // It's a file
            this.contextValue = 'fileBrowserFile';
            this.iconPath = vscode.ThemeIcon.File;
        }
    }

    // Helper method to get the workspace root (move this from your provider)
    private getWorkspaceRoot(): vscode.Uri | undefined {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri;
        } else {
            return undefined;
        }
    }
}

/**
 * Provides data for the File Browser TreeView.
 */
export class FileBrowserProvider implements vscode.TreeDataProvider<FileBrowserItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<FileBrowserItem | undefined | void> = new vscode.EventEmitter<FileBrowserItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FileBrowserItem | undefined | void> = this._onDidChangeTreeData.event;

    private disposables: vscode.Disposable[] = [];
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor(private context: vscode.ExtensionContext, private projectManager: ProjectManager) {
        // Listen for workspace folder changes to refresh the tree view
        vscode.workspace.onDidChangeWorkspaceFolders(() => this.onWorkspaceFoldersChanged(), this, this.disposables);

        this.initializeFileWatcher();
        this.registerCommands();
    }

    getTreeItem(element: FileBrowserItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: FileBrowserItem): Promise<FileBrowserItem[]> {
        if (!element) {
            // Root level items: list all projects from the workspace configuration
            const items: FileBrowserItem[] = [];
            const workspaceConfig = this.projectManager.workspaceConfig; // Use workspaceConfig from ProjectManager
    
            if (workspaceConfig) {
                workspaceConfig.projects.forEach(project => {
                    const content = fs.readFileSync(project.projectInfoPath, 'utf-8');
                    const projectConfig = JSON.parse(content) as ProjectConfig;
                    project.projectRoot = projectConfig.projectRoot || workspaceConfig.workspaceRoot;
    
                    const projectUri = vscode.Uri.file(project.projectRoot || '');
                    const collapsibleState = project.active ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
    
                    const projectItem = new FileBrowserItem(
                        project.name,
                        projectUri,
                        collapsibleState
                    );
    
                    // Set context value based on the active status of the project
                    projectItem.contextValue = project.active ? 'activeProject' : 'inactiveProject';
                    projectItem.iconPath = vscode.ThemeIcon.Folder; // Set an icon for projects
    
                    items.push(projectItem);
                });
            }
            return items;
        } else {
            // If the element is a project and it is active, return its files and folders
            const workspaceConfig = this.projectManager.workspaceConfig;
            if (workspaceConfig) {
                const project = workspaceConfig.projects.find(p => p.projectRoot === element.resourceUri.fsPath);
                if (project && project.active) {
                    return this.getFilesAndFolders(element.resourceUri);
                }
            }
    
            // If the element is a folder, return its files and subfolders
            return this.getFilesAndFolders(element.resourceUri);
        }
    }
    
    private async getFilesAndFolders(uri: vscode.Uri): Promise<FileBrowserItem[]> {
        const items: FileBrowserItem[] = [];
        const skipExtensions = ['.prjinfo', '.workspace', '.ews']; // List of extensions to skip

        try {
            const directoryItems = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, fileType] of directoryItems) {
                if (skipExtensions.some(ext => name.endsWith(ext))) {
                    continue;
                }
    
                const itemUri = vscode.Uri.joinPath(uri, name);
                let collapsibleState = vscode.TreeItemCollapsibleState.None;
                let command: vscode.Command | undefined;
    
                if (fileType === vscode.FileType.Directory) {
                    // If it's a directory, it should be collapsible
                    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                } else {
                    // If it's a file, assign the open command
                    command = {
                        command: 'vscode.open',
                        title: 'Open File',
                        arguments: [itemUri]
                    };
                }
    
                const fileBrowserItem = new FileBrowserItem(
                    name,
                    itemUri,
                    collapsibleState,
                    command
                );
                fileBrowserItem.iconPath = fileType === vscode.FileType.Directory ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
    
                items.push(fileBrowserItem);
            }
        } catch (error) {
            console.error(`Error reading directory ${uri.fsPath}: ${error}`);
        }
        return items;
    }

    /**
     * Registers the File Browser commands.
     */
    private registerCommands() {
        // Clipboard for copy/paste operations
        let clipboard: vscode.Uri | null = null;
        let isCutOperation = false;

        this.context.subscriptions.push(
            vscode.commands.registerCommand('fileBrowser.newFile', async (item?: FileBrowserItem) => {
                const directoryUri = item ? item.resourceUri : this.getWorkspaceRoot();
                if (!directoryUri) {
                    vscode.window.showErrorMessage('No directory selected');
                    return;
                }
                await this.createNewFile(directoryUri);
                this.refresh();
            }),
            vscode.commands.registerCommand('fileBrowser.newFolder', async (item?: FileBrowserItem) => {
                const directoryUri = item ? item.resourceUri : this.getWorkspaceRoot();
                if (!directoryUri) {
                    vscode.window.showErrorMessage('No directory selected');
                    return;
                }
                await this.createNewFolder(directoryUri);
                this.refresh();
            }),
            vscode.commands.registerCommand('fileBrowser.delete', async (item: FileBrowserItem) => {
                await this.deleteResource(item.resourceUri);
                this.refresh();
            }),
            vscode.commands.registerCommand('fileBrowser.rename', async (item: FileBrowserItem) => {
                await this.renameResource(item.resourceUri);
                this.refresh();
            }),
            vscode.commands.registerCommand('fileBrowser.copy', (item: FileBrowserItem) => {
                clipboard = item.resourceUri;
                isCutOperation = false;
                vscode.window.showInformationMessage(`Copied '${path.basename(item.resourceUri.fsPath)}'`);
            }),
            vscode.commands.registerCommand('fileBrowser.paste', async (item?: FileBrowserItem) => {
                if (!clipboard) {
                    vscode.window.showWarningMessage('Nothing to paste.');
                    return;
                }
                const targetDirectoryUri = item ? item.resourceUri : this.getWorkspaceRoot();
                if (!targetDirectoryUri) {
                    vscode.window.showErrorMessage('No directory selected');
                    return;
                }
                const destinationUri = vscode.Uri.joinPath(targetDirectoryUri, path.basename(clipboard.fsPath));
                try {
                    await vscode.workspace.fs.copy(clipboard, destinationUri, { overwrite: false });
                    if (isCutOperation) {
                        await vscode.workspace.fs.delete(clipboard, { recursive: true });
                        isCutOperation = false;
                    }
                    clipboard = null;
                    vscode.window.showInformationMessage(`Pasted '${path.basename(destinationUri.fsPath)}'`);
                    this.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Error pasting: ${error}`);
                }
            }),
            vscode.commands.registerCommand('fileBrowser.refresh', () => {
                this.refresh();
            }),
            vscode.commands.registerCommand('fileBrowser.revealInExplorer', (item: FileBrowserItem) => {
                vscode.commands.executeCommand('revealFileInOS', item.resourceUri);
            }),
            vscode.commands.registerCommand('fileBrowser.placeholderClick', async () => {
                // This command can be left empty or provide feedback if needed
            })
        );
    }

    /**
     * Gets the root directory of the workspace.
     */
    private getWorkspaceRoot(): vscode.Uri | undefined {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri;
        } else {
            vscode.window.showErrorMessage('No workspace is open.');
            return undefined;
        }
    }

    /**
     * Creates a new file in the given directory.
     */
    private async createNewFile(directoryUri: vscode.Uri) {
        const fileName = await vscode.window.showInputBox({ prompt: 'Enter the new file name' });
        if (fileName) {
            const fileUri = vscode.Uri.joinPath(directoryUri, fileName);
            try {
                await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document);
            } catch (error) {
                vscode.window.showErrorMessage(`Error creating file: ${error}`);
            }
        }
    }

    /**
     * Creates a new folder in the given directory.
     */
    private async createNewFolder(directoryUri: vscode.Uri) {
        const folderName = await vscode.window.showInputBox({ prompt: 'Enter the new folder name' });
        if (folderName) {
            const folderUri = vscode.Uri.joinPath(directoryUri, folderName);
            try {
                await vscode.workspace.fs.createDirectory(folderUri);
            } catch (error) {
                vscode.window.showErrorMessage(`Error creating folder: ${error}`);
            }
        }
    }

    /**
     * Deletes the given resource (file or folder).
     */
    private async deleteResource(resourceUri: vscode.Uri) {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete '${path.basename(resourceUri.fsPath)}'?`,
            { modal: true },
            'Delete'
        );
        if (confirm === 'Delete') {
            try {
                await vscode.workspace.fs.delete(resourceUri, { recursive: true, useTrash: true });
            } catch (error) {
                vscode.window.showErrorMessage(`Error deleting: ${error}`);
            }
        }
    }

    /**
     * Renames the given resource (file or folder).
     */
    private async renameResource(resourceUri: vscode.Uri) {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter the new name',
            value: path.basename(resourceUri.fsPath)
        });
        if (newName && newName !== path.basename(resourceUri.fsPath)) {
            const targetUri = vscode.Uri.joinPath(resourceUri.with({ path: path.dirname(resourceUri.path) }), newName);
            try {
                await vscode.workspace.fs.rename(resourceUri, targetUri, { overwrite: false });
            } catch (error) {
                vscode.window.showErrorMessage(`Error renaming: ${error}`);
            }
        }
    }

    private refreshTimeout: NodeJS.Timeout | undefined;

    /**
     * Handles workspace folder changes.
     */
    private onWorkspaceFoldersChanged() {
        this.initializeFileWatcher();
        this.refresh();
    }

    /**
     * Handles file changes by refreshing the TreeView.
     * Debounces rapid changes to prevent excessive refreshes.
     */
    private onFileChanged(uri: vscode.Uri) {
        // Debounce the refresh to prevent excessive updates
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = setTimeout(() => {
            this.refresh();
        }, 300);
    }

    /**
     * Initializes the file system watcher to monitor file changes.
     */
    private initializeFileWatcher() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            const pattern = new vscode.RelativePattern(workspaceFolder, '**/*');

            this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

            this.fileWatcher.onDidCreate(uri => this.onFileChanged(uri), this, this.disposables);
            this.fileWatcher.onDidChange(uri => this.onFileChanged(uri), this, this.disposables);
            this.fileWatcher.onDidDelete(uri => this.onFileChanged(uri), this, this.disposables);
        }
    }

    /**
     * Disposes of the watcher and other disposables.
     */
    dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.disposables.forEach(d => d.dispose());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}