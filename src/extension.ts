import * as vscode from 'vscode';

import { ProjectManager} from './projectManager';

export function activate(context: vscode.ExtensionContext) {
    const projectManager = new ProjectManager(context);
}

export function deactivate() {}
