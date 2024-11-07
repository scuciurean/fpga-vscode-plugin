import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ProjectManager, ProjectInfo, ProjectConfig } from './projectManager';

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly moduleData?: any  // Store submodule data for recursive tree creation
    ) {
        super(label, collapsibleState);

        // Set the command to open the webview when the element is clicked
        this.command = {
            command: 'hierarchicalView.showBlockDetails',
            title: 'Show Block Details',
            arguments: [moduleData]  // Pass the moduleData to the webview
        };
    }
}

export class ModuleListTreeItem extends vscode.TreeItem {
    constructor(
        public moduleName: string,
        public path: string  // Path in "filepath:line" format
    ) {
        super(moduleName, vscode.TreeItemCollapsibleState.None);

        // Command to open file at the specified line
        this.command = {
            command: 'moduleListProvider.openFileAtLine',
            title: 'Open File at Line',
            arguments: [path]  // Pass the path as an argument to the command
        };
    }
}

export class ModuleDataService {
    private static instance: ModuleDataService;
    private topModule: ModuleListTreeItem = { moduleName: "NOT DEFINED", path: "" };
    private moduleHierarchy: { [moduleName: string]: any } = {};
    private moduleList: { moduleName: string; path: any }[] = [];

    private _onDidUpdateModules: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidUpdateModules: vscode.Event<void> = this._onDidUpdateModules.event;
    private _onTopModuleChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onTopModuleChange: vscode.Event<void> = this._onTopModuleChange.event;

    private constructor(private context: vscode.ExtensionContext) {
        this.loadModules();

        // Watch for file changes to refresh the module hierarchy
        vscode.workspace.onDidChangeTextDocument(event => {
            if (['.v', '.vhd', '.sv'].some(ext => event.document.uri.fsPath.endsWith(ext))) {
                this.loadModules();
            }
        });
        
        ProjectManager.instance.onDidUpdateProject(() => this.loadModules());
    }

    public static getInstance(context: vscode.ExtensionContext): ModuleDataService {
        if (!ModuleDataService.instance) {
            ModuleDataService.instance = new ModuleDataService(context);
        }
        return ModuleDataService.instance;
    }

    getTopModule() {
        return this.topModule;
    }

    setTopModule(module : ModuleListTreeItem) {
        this.topModule = module;
        this._onTopModuleChange.fire();  // Emit event when top module changes
    }

    getModuleHierarchy() {
        return this.moduleHierarchy;
    }

    getModuleList() {
        return this.moduleList;
    }

    loadModules() {
        const project = ProjectManager.instance.getActiveProject()
        const pythonPath = 'python3';
        const scriptPath = path.join(this.context.extensionPath, 'src', 'viewer/parse_sources.py');
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const proejctRoot = project?.projectRoot;
        // TODO: get prjinfo path from the current active project
        if (!proejctRoot) {
            vscode.window.showErrorMessage('Invalid project info');
            return;
        }
        const prjInfoPath = path.join(proejctRoot, '.prjinfo');

        cp.exec(`${pythonPath} ${scriptPath} ${prjInfoPath}`, (err, stdout, stderr) => {
            if (err) {
                console.error("Error running Python script:", err);
                return;
            }
            if (stderr) {
                console.error("Python script error:", stderr);
            }

            try {
                const result = JSON.parse(stdout);
                this.moduleHierarchy = result;
                this.moduleList = Object.keys(result).map((key) => ({
                    moduleName: key,
                    path: `${result[key].path[0]}:${result[key].path[1]}`  // Format as "filepath:line"
                }));

                // Emit an event to notify listeners (i.e., the views) to refresh
                this._onDidUpdateModules.fire();
            } catch (parseError) {
                console.error("Error parsing JSON from Python output:", parseError);
            }
        });
    }
}

export class ModuleListProvider implements vscode.TreeDataProvider<ModuleListTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModuleListTreeItem | undefined | null | void> = new vscode.EventEmitter<ModuleListTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModuleListTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext, private moduleDataService: ModuleDataService) {  

        this.moduleDataService = moduleDataService;
        this.readTopModule();

        // Refresh tree when modules update
        this.moduleDataService.onDidUpdateModules(() => this.refresh());  
        ProjectManager.instance.onDidUpdateProject(() => this.refresh());

        const treeView = vscode.window.createTreeView('moduleView', {
            treeDataProvider: this
        });

        // Register the command to open files at a specific line
        context.subscriptions.push(
            vscode.commands.registerCommand('moduleListProvider.openFileAtLine', (path: string) => {
                this.openFileAtLine(path);
            })
        );
        
        context.subscriptions.push(
            vscode.commands.registerCommand('moduleListProvider.setAsTop', (item) => {
                this.setAsTop(item);
                this.refresh();
            })
        );

        context.subscriptions.push(treeView, this);
    }

    getTreeItem(element: ModuleListTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<ModuleListTreeItem[]> {
        const moduleList = this.moduleDataService.getModuleList();
        let topItem = this.moduleDataService.getTopModule();
        topItem.label = "TOP MODULE : " + topItem.moduleName;
        topItem.command = undefined;
        topItem.description = "🟢";

        return Promise.resolve([
            topItem,
            ...moduleList.map(item => new ModuleListTreeItem(item.moduleName, item.path))
        ]);
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }

    refresh(): void {
        this.readTopModule();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Opens the file at the specified path and line.
     */
    private async openFileAtLine(path: string) {
        // Split the path into file path and line number
        const [filePath, lineStr] = path.split(':');
        const line = parseInt(lineStr, 10) - 1;  // VSCode uses 0-based line numbers

        try {
            const fileUri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document);
            
            // Move the cursor to the specified line
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            vscode.window.showErrorMessage(`Unable to open file at ${path}`);
        }
    }

    setAsTop(item: ModuleListTreeItem) {
        this.moduleDataService.setTopModule(item);

        const currentProject = ProjectManager.instance.getActiveProject()

        if (!currentProject) {
            vscode.window.showErrorMessage('No selected project!');
            return;
        }
        if (fs.existsSync(currentProject.projectInfoPath)) {
            const info = fs.readFileSync(currentProject.projectInfoPath, 'utf-8');
            let content: ProjectInfo = JSON.parse(info);
            content.topModule = item.moduleName;
            currentProject.info = content;
            fs.writeFileSync(currentProject.projectInfoPath, JSON.stringify(currentProject.info, null, 2), 'utf-8');
        }
    }

    readTopModule() {
        const currentProject = ProjectManager.instance.getActiveProject()

        if (!currentProject) {
            vscode.window.showErrorMessage('No selected project!');
            return;
        }
        if (fs.existsSync(currentProject.projectInfoPath)) {
            const info = fs.readFileSync(currentProject.projectInfoPath, 'utf-8');
            let content: ProjectInfo = JSON.parse(info);
            const moduleName = content.topModule ? content.topModule : ""
            this.moduleDataService.setTopModule(new ModuleListTreeItem(moduleName, ""));
        }
    }
}


export class HierarchicalViewer implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentPanel: vscode.WebviewPanel | undefined; // Track the current WebviewPanel

    constructor(private context: vscode.ExtensionContext, private moduleDataService: ModuleDataService) {
        this.moduleDataService = moduleDataService;

        // Refresh tree when modules update
        this.moduleDataService.onDidUpdateModules(() => this.refresh());
        this.moduleDataService.onTopModuleChange(() => this.refresh());
        
        // Register command to show the webview when a tree item is clicked
        vscode.commands.registerCommand('hierarchicalView.showBlockDetails', (moduleData: any) => {
            this.showWebView(moduleData);
        });

        // Register the tree view for the hierarchical module viewer
        const treeView = vscode.window.createTreeView('hierarchicalView', {
            treeDataProvider: this
        });

        // Open WebView when a tree item in the block view is clicked
        treeView.onDidChangeSelection(event => {
            if (event.selection.length > 0) {
                const selectedItem = event.selection[0]; // Get the selected tree item
                this.showWebView(selectedItem.moduleData); // Pass moduleData to the WebView
            }
        });

        context.subscriptions.push(treeView, this);
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }
    
    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        const moduleHierarchy = this.moduleDataService.getModuleHierarchy();

        if (!element) {
            const mainModule = this.moduleDataService.getTopModule();
            // If no element is passed, return the main module as the root of the tree
            if (mainModule) {
                const rootModule = moduleHierarchy[mainModule.moduleName];
                return Promise.resolve([new TreeItem(mainModule.moduleName, vscode.TreeItemCollapsibleState.Collapsed, rootModule)]);
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

    refresh(): void {
        this._onDidChangeTreeData.fire();
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
