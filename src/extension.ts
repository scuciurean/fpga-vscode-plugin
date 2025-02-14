import * as vscode from 'vscode';

import { ProjectManager} from './projectManager';
import { HierarchicalViewer, ModuleDataService, ModuleListProvider} from './viewer';
import { ExecutionManager} from './execution';
import { Wizard } from './wizard';

export function activate(context: vscode.ExtensionContext) {
    ProjectManager.initialize(context);
    
    const moduleDataService = ModuleDataService.getInstance(context);
    const hierarchicalViewer = new HierarchicalViewer(context, moduleDataService);
    const moduleListProvider = new ModuleListProvider(context ,moduleDataService);

    const executionManager = new ExecutionManager(context);
    
    Wizard.initialize(context);
    
}

export function deactivate() {}
