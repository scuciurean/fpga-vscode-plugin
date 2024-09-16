// extension.ts
import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { FileBrowserProvider } from './fileBrowser';
import { ConstraintsProvider } from './constraintsManager';
import { ExecutionManager } from './executionManager';

/**
 * Activates the extension.
 * @param context The extension context.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Project Manager extension is now active!');

    // Initialize the Project Manager
    new ProjectManager(context);

    // Initialize the File Browser Provider
    const fileBrowserProvider = new FileBrowserProvider(context);
    vscode.window.registerTreeDataProvider('fileBrowserView', fileBrowserProvider);

    // Dispose of the provider when the extension is deactivated
    context.subscriptions.push(fileBrowserProvider);

    // Initialize the Constraints Provider
    const constraintsProvider = new ConstraintsProvider(context);
    vscode.window.registerTreeDataProvider('constraintsView', constraintsProvider);

    // Register the play button command for the RUN view
    context.subscriptions.push(
      vscode.commands.registerCommand('runView.playCommand', () => {
          vscode.window.showInformationMessage('Running the project...');
          // Add the logic to trigger your build/run process
          runProject();
      })
  );

  // Initialize the ExecutionManager view provider
  const executionManager = new ExecutionManager();
  vscode.window.createTreeView('runView', {
      treeDataProvider: executionManager
  });
}

function runProject() {
  // Add your logic to run or build the project here
  vscode.window.showInformationMessage('Project is now running.');
}

/**
 * Deactivates the extension.
 */
export function deactivate() {}
