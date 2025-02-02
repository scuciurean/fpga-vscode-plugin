"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
function getCreateProjectWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        .create-button {
          background-color: #007acc;
          color: white;
          border: none;
          padding: 10px 20px;
          font-size: 16px;
          cursor: pointer;
          border-radius: 5px;
        }
        .create-button:hover {
          background-color: #005f9e;
        }
      </style>
    </head>
    <body>
      <h1>Create a New Project</h1>
      <button class="create-button" onclick="createProject()">Create Project</button>

      <script>
        const vscode = acquireVsCodeApi();
        function createProject() {
          vscode.postMessage({ command: 'createProject' });
        }
      </script>
    </body>
    </html>
  `;
}
function activate(context) {
    // Create two TreeViews: one for Project and one for Test
    const projectProvider = new ProjectViewProvider();
    const testProvider = new TestViewProvider();
    vscode.window.createTreeView('projectView', {
        treeDataProvider: projectProvider
    });
    vscode.window.createTreeView('testView', {
        treeDataProvider: testProvider
    });
    // Register commands for creating new projects or tests
    context.subscriptions.push(vscode.commands.registerCommand('projectManager.createProject', () => {
        vscode.window.showInformationMessage('Starting project creation...');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('projectManager.openCreateProjectWebview', () => {
        const panel = vscode.window.createWebviewPanel('createProject', // Internal name of the panel
        'Create Project', // Title of the panel
        vscode.ViewColumn.One, // Show in the current editor column
        { enableScripts: true } // Enable JavaScript in the webview
        );
        panel.webview.html = getCreateProjectWebviewContent(); // Set the content of the webview
    }));
}
class ProjectViewProvider {
    // Called by VS Code to get the Tree Item to show
    getTreeItem(element) {
        return element;
    }
    // Called by VS Code to get the children of a given element or the root element
    getChildren(element) {
        // This ensures that we are displaying the "Create New Project" button at the top of the tree
        if (!element) {
            return Promise.resolve([new ProjectItem('Create New Project', 'projectManager.openCreateProjectWebview', true)]);
        }
        return Promise.resolve([]);
    }
}
// This class represents each item in the TreeView
class ProjectItem extends vscode.TreeItem {
    constructor(label, commandId, isButton) {
        super(label, vscode.TreeItemCollapsibleState.None);
        // Command that is triggered when the item is clicked
        this.command = { command: commandId, title: label };
        // Display the folder icon or a special button-like appearance
        if (isButton) {
            this.iconPath = new vscode.ThemeIcon('folder-opened'); // Use a relevant icon, or create your own
            this.description = ''; // No description, make it look like a button
        }
        else {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}
// TreeView for "Test"
class TestViewProvider {
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve([new TestItem('Create New Test', 'projectManager.createTest')]);
        }
        return Promise.resolve([]);
    }
}
class TestItem extends vscode.TreeItem {
    constructor(label, commandId) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = { command: commandId, title: label };
        this.iconPath = new vscode.ThemeIcon('beaker'); // Using beaker icon for tests, you can change it
    }
}
//# sourceMappingURL=extension.js.map