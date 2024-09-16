// fileBrowser.ts
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Represents a single item in the File Browser TreeView.
 */
class FileBrowserItem extends vscode.TreeItem {
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
            } else {
                // It's a regular folder
                this.contextValue = 'fileBrowserFolder';
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

    constructor(private context: vscode.ExtensionContext) {
        // Listen for workspace folder changes to refresh the tree view
        vscode.workspace.onDidChangeWorkspaceFolders(() => this.onWorkspaceFoldersChanged(), this, this.disposables);

        // Initialize file system watcher
        this.initializeFileWatcher();

        // Register commands
        this.registerCommands();
    }

    getTreeItem(element: FileBrowserItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileBrowserItem): Promise<FileBrowserItem[]> {
        if (!element) {
            // Create a root item
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                // No workspace is open, show "Open Project" and "Create Project" buttons
                const items: FileBrowserItem[] = [];
                items.push(new FileBrowserItem(
                    'Open Project',
                    vscode.Uri.parse(''),
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'projectManager.openProject',
                        title: 'Open Project'
                    }
                ));
                items.push(new FileBrowserItem(
                    'Create Project',
                    vscode.Uri.parse(''),
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'projectManager.createProject',
                        title: 'Create Project'
                    }
                ));
                return items;
            } else {
                // Return the root item
                const rootItem = new FileBrowserItem(
                    path.basename(workspaceRoot.fsPath), // You can name it 'Workspace' or the workspace folder name
                    workspaceRoot,
                    vscode.TreeItemCollapsibleState.Expanded
                );
                rootItem.contextValue = 'fileBrowserRoot';
                rootItem.iconPath = vscode.ThemeIcon.Folder; // Optional: Set an icon
                return [rootItem];
            }
        } else {
            // Return the children of the given element
            const childItems = await this.getFilesAndFolders(element.resourceUri);
            return childItems;
        }
    }

    private async getFilesAndFolders(uri: vscode.Uri): Promise<FileBrowserItem[]> {
        const items: FileBrowserItem[] = [];
        try {
            const directoryItems = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, fileType] of directoryItems) {
                // Skip .prjinfo files
                if (name.endsWith('.prjinfo')) {
                    continue; // Skip this file and move to the next
                }
    
                const itemUri = vscode.Uri.joinPath(uri, name);
                let collapsibleState = vscode.TreeItemCollapsibleState.None;
                let command: vscode.Command | undefined;
    
                if (fileType === vscode.FileType.Directory) {
                    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                } else {
                    // It's a file, assign the command
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
                items.push(fileBrowserItem);
            }
        } catch (error) {
            console.error(`Error reading directory ${uri.fsPath}: ${error}`);
        }
        return items;
    }
    

    refresh(): void {
        this._onDidChangeTreeData.fire();
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
        }, 300); // Adjust the debounce time as needed
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
     * Disposes of the watcher and other disposables.
     */
    dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.disposables.forEach(d => d.dispose());
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
}
