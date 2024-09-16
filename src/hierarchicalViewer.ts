import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export class HierarchicalViewer implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private mainModule: string | null = null;
    private moduleHierarchy: { [moduleName: string]: any } = {}; // Store the parsed module hierarchy
    private currentPanel: vscode.WebviewPanel | undefined; // Track the current WebviewPanel

    constructor(private context: vscode.ExtensionContext) {
        this.loadModules();

        // Register command to show the webview when a tree item is clicked
        vscode.commands.registerCommand('hierarchicalViewer.showBlockDetails', (moduleData: any) => {
            this.showWebView(moduleData);
        });

        // Watch for file changes and refresh the webview
        vscode.workspace.onDidChangeTextDocument(event => {
            // Check if the changed file is a source file (e.g., .v, .vhd, .sv)
            if (event.document.uri.fsPath.endsWith('.v') ||
                event.document.uri.fsPath.endsWith('.vhd') ||
                event.document.uri.fsPath.endsWith('.sv')) {
                // Reload the module hierarchy
                this.loadModules();
            }
        });
    }

    // Load modules by running the Python backend
    private loadModules() {
        const pythonPath = 'python3';
        const scriptPath = path.join(this.context.extensionPath, 'src', 'viewer/parse_sources.py');  // Python script path

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const prjInfoPath = path.join(workspaceRoot, '.prjinfo'); // .prjinfo in the root of the workspace

        // Execute the Python script and capture its output
        cp.exec(`${pythonPath} ${scriptPath} ${prjInfoPath}`, (err, stdout, stderr) => {
            if (err) {
                console.error("Error running Python script:", err);
                return;
            }
            if (stderr) {
                console.error("Python script error:", stderr);
            }

            // Parse the Python output (JSON string of the module hierarchy)
            try {
                const result = JSON.parse(stdout);
                console.log("Module Hierarchy Parsed:", result);

                // Set the first key as the main module (e.g., `helloworldfpga`)
                this.mainModule = Object.keys(result)[0];
                this.moduleHierarchy = result;

                // Refresh the tree view to display the new module hierarchy
                this._onDidChangeTreeData.fire();

                // If there is an open webview panel, refresh it with the updated data
                if (this.currentPanel) {
                    this.currentPanel.webview.postMessage({
                        command: 'refresh',
                        data: this.moduleHierarchy
                    });
                }

            } catch (parseError) {
                console.error("Error parsing JSON from Python output:", parseError);
            }
        });
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            // If no element is passed, return the main module as the root of the tree
            if (this.mainModule) {
                const rootModule = this.moduleHierarchy[this.mainModule];
                return Promise.resolve([new TreeItem(this.mainModule, vscode.TreeItemCollapsibleState.Collapsed, rootModule)]);
            }
            return Promise.resolve([]);
        } else {
            // Retrieve the submodules of the current module
            const submodules = element.moduleData?.submodules || [];

            // Create tree items for each submodule
            const submoduleItems = submodules.map((submodule: any) => {
                return new TreeItem(
                    `${submodule.instance_name} (${submodule.module_name})`,
                    submodule.submodules.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    submodule
                );
            });

            return Promise.resolve(submoduleItems);
        }
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }

    /**
     * Show a webview with details of the selected module instance.
     * If it's the top module, draw its submodules in the webview.
     */
    showWebView(moduleData: any) {
        if (this.currentPanel) {
            this.currentPanel.reveal(vscode.ViewColumn.One);
            this.currentPanel.title = `${moduleData.instance_name}`;
            this.currentPanel.webview.postMessage({
                command: 'refresh',
                data: moduleData
            });
        } else {
            this.currentPanel = vscode.window.createWebviewPanel(
                'blockDiagram',
                `${moduleData.instance_name}`,
                vscode.ViewColumn.One,
                { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'viewer', 'web'))] }
            );
    
            const webviewPath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'viewer', 'web', 'index.html'));
            const webviewUri = this.currentPanel!.webview.asWebviewUri(webviewPath);
            this.currentPanel.webview.html = this.getWebviewContent(webviewUri);
    
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
            }, null, this.context.subscriptions);
        }
    
        // If the module has no submodules, render a single block
        if (!moduleData.submodules || moduleData.submodules.length === 0) {
            this.currentPanel.webview.postMessage({
                command: 'renderSingleModule',
                data: moduleData
            });
        } else {
            // Otherwise, render multiple submodules
            this.currentPanel.webview.postMessage({
                command: 'renderSubmodules',
                data: moduleData.submodules
            });
        }
    }
    
    private getWebviewContent(webviewUri: vscode.Uri): string {
        const cssUri = this.currentPanel!.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'viewer', 'web', 'style.css')));
        const jsUri = this.currentPanel!.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'viewer', 'web', 'viewer.js')));
    
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Module Block Viewer</title>
                <link rel="stylesheet" type="text/css" href="${cssUri}">
            </head>
            <body>
                <div id="canvas"></div>
                <script src="${jsUri}"></script>
            </body>
            </html>
        `;
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly moduleData?: any  // Store submodule data for recursive tree creation
    ) {
        super(label, collapsibleState);

        // Set the command to open the webview when the element is clicked
        this.command = {
            command: 'hierarchicalViewer.showBlockDetails',
            title: 'Show Block Details',
            arguments: [moduleData]  // Pass the moduleData to the webview
        };
    }
}
