// wizard.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Wizard {
  private static _instance: Wizard;
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.registerCommands();
  }

  public static initialize(context: vscode.ExtensionContext): void {
    if (!Wizard._instance) {
      Wizard._instance = new Wizard(context);
    }
  }

  private registerCommands(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('projectManager.configureProject', () => {
        // Build the URI to your React app's built (dist) folder
        const wizardDistUri = vscode.Uri.joinPath(
          vscode.Uri.file(this.context.extensionPath),
          'src',
          'components',
          'wizard',
          'dist'
        );

        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
          'projectManager.configureProject', // Internal identifier
          'Configure Project', // Title shown to the user
          vscode.ViewColumn.One, // Editor column to show the webview
          {
            enableScripts: true,
            localResourceRoots: [wizardDistUri]
          }
        );

        // Get the path to the React app's index.html file
        const indexHtmlPath = vscode.Uri.joinPath(wizardDistUri, 'index.html');

        fs.readFile(indexHtmlPath.fsPath, 'utf8', (err, data) => {
          if (err) {
            vscode.window.showErrorMessage('Could not load the wizard configuration.');
            return;
          }

          // Inject the <base> tag and the custom CSS into the <head>
          let html = data.replace(/<head>/i, `<head><base href="${indexHtmlPath}/">`);

          // Rewrite asset URLs (src/href attributes) that start with "/" to load correctly in the webview
          html = html.replace(/(src|href)="\/([^"]+)"/g, (match, attr, resourcePath) => {
            const filePath = vscode.Uri.joinPath(wizardDistUri, resourcePath);
            const webviewUri = panel.webview.asWebviewUri(filePath).toString();
            return `${attr}="${webviewUri}"`;
          });

          panel.webview.html = html;

          const optionsPath = path.join(this.context.extensionPath, 'library', 'basil.json');
          if (fs.existsSync(optionsPath)) {
              const options = fs.readFileSync(optionsPath, 'utf-8');
              const data = JSON.parse(options);
              panel.webview.postMessage({ type: 'options', data });
          }
        });
      })
    );
  }
}