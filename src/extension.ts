import * as vscode from 'vscode';

import { ProjectManager} from './projectManager';
import { HierarchicalViewer, ModuleDataService, ModuleListProvider} from './viewer';

export function activate(context: vscode.ExtensionContext) {
    ProjectManager.initialize(context);
    
    const moduleDataService = ModuleDataService.getInstance(context);
    const hierarchicalViewer = new HierarchicalViewer(context, moduleDataService);
    const moduleListProvider = new ModuleListProvider(context ,moduleDataService);
    
}

export function deactivate() {}
