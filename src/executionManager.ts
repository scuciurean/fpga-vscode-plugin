import * as vscode from 'vscode';

export class ExecutionManager implements vscode.TreeDataProvider<ExecutionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ExecutionItem | undefined | void> = new vscode.EventEmitter<ExecutionItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ExecutionItem | undefined | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: ExecutionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ExecutionItem): Thenable<ExecutionItem[]> {
        const items: ExecutionItem[] = [];
        // Define any tasks or status items you want to show in the RUN (Execution) view here.
        return Promise.resolve(items);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

class ExecutionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
