import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ProjectManager, ProjectInfo } from './projectManager';

export enum RunStatus {
    Idle = 'idle',
    InProgress = 'inProgress',
    Success = 'success',
    Failed = 'failed'
}

class RunItem extends vscode.TreeItem {
    private _onDidChangeTreeData: vscode.EventEmitter<RunItem | undefined> = new vscode.EventEmitter<RunItem | undefined>();
    public readonly onDidChangeTreeData: vscode.Event<RunItem | undefined> = this._onDidChangeTreeData.event;

    constructor(
        public readonly label: string,
        public status: RunStatus = RunStatus.Idle,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public iconPath?: vscode.ThemeIcon,
        public readonly children: RunItem[] = []
    ) {
        super(label, collapsibleState);
        const icon_status = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));  
        this.tooltip = `${label} - ${icon_status}`;
        this.command = command;
        this.setStatus(RunStatus.Idle);
    }

    private getStatusIcon(): vscode.ThemeIcon {
        switch (this.status) {
            case RunStatus.Success:
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case RunStatus.Failed:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case RunStatus.InProgress:
                return new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.green'));
            case RunStatus.Idle:
            default:
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.white'));
        }
    }

    // Method to update the status and trigger tree refresh
    public setStatus(status: RunStatus) {
        this.status = status;

        // Update the icon based on status
        switch (this.status) {
            case RunStatus.Success:
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                break;
            case RunStatus.Failed:
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
                break;
            case RunStatus.InProgress:
                this.iconPath = new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.green'));
                break;
            case RunStatus.Idle:
            default:
                this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.white'));
                break;
                
        }

        // Fire the event to notify TreeView to update
        this._onDidChangeTreeData.fire(this);
    }
}

export class ExecutionManager implements vscode.TreeDataProvider<RunItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RunItem | undefined | void> = new vscode.EventEmitter<RunItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<RunItem | undefined | void> = this._onDidChangeTreeData.event;

    private prjInfoWatcher: vscode.FileSystemWatcher | undefined;

    private runItems: RunItem[] = [];
    private activeRun: RunItem | null = null;
    
    constructor(private context: vscode.ExtensionContext) {
        ProjectManager.instance.onDidUpdateProject(() => this.refresh());

        const treeView = vscode.window.createTreeView('executionView', {
            treeDataProvider: this
        });

        // Register the command to open files at a specific line
        // context.subscriptions.push(
        //     vscode.commands.registerCommand('moduleListProvider.openFileAtLine', (path: string) => {
        //         vscode.window.showInformationMessage(`Building project: ${project.label}`);
        //         runProject(project);
        //     })
        // );
        
        this.initializeRuns();
        this.registerCommands();
        this.initializeWatcher();
        this.refresh();
    }

    private registerCommands() {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('execution', (...args: string[]) => {
                if (!args || args.length === 0) {
                    vscode.window.showErrorMessage('No arguments provided!');
                    return;
                }
                this.exec(args);
            }),
        );

    }

    private findRunItem(runCommand: string[]): RunItem | undefined {
        // Traverse through the main runItems categories
        for (const item of this.runItems) {
            // If the item has children, check through them (e.g., Synthesis -> Transform, Netlist, etc.)
            for (const child of item.children) {
                // Check if the child is a "Run" item (i.e., has a command with arguments)
                if (child.children[0].command && child.children[0].command.arguments) {
                    // Compare the arguments of the child with the runCommand we're looking for
                    const childArguments = child.children[0].command.arguments as string[];
    
                    // Check if the runCommand matches the arguments of this child
                    if (childArguments.length === runCommand.length && 
                        childArguments.every((arg, index) => arg === runCommand[index])) {
                        // return child;  // Return the matching child
                        return child.children[0];
                    }
                }
            }
        }
        return undefined;  // Return undefined if no match is found
    }
    

    private async exec(args: string[]) {
        const validCommands = ['synth', 'timing', 'route', 'bitstream']
        const [mainCommand, ...subCommands] = args;
        if (validCommands.includes(mainCommand)) {
            // (this as any)[mainCommand](subCommands);
            const currentProject = ProjectManager.instance.getActiveProject();
            const projectPath = currentProject?.projectRoot;
            if (!args.includes('logs') && projectPath) {
                const runItem = this.findRunItem([mainCommand, ...subCommands]);
                if (!runItem)
                {
                    vscode.window.showErrorMessage("Invalid request")
                    return;
                }
                runItem.setStatus(RunStatus.InProgress);  // Set to InProgress
                this.refresh();
                const returnCode = await runCommand(projectPath, `make ${mainCommand}/` + subCommands.join('/'))
                if (returnCode != 0) {
                    vscode.window.showErrorMessage("Command failed with code:" + returnCode)
                    runItem.setStatus(RunStatus.Failed);
                    this.refresh();
                } else {
                    runItem.setStatus(RunStatus.Success);
                    this.refresh();
                }
            } else {
                try {
                    const fileUri = vscode.Uri.file(`${projectPath}/build/top_synth.log`);
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    await vscode.window.showTextDocument(document);
                } catch (error) {
                    vscode.window.showErrorMessage("Failed to open or show the log file.");
                    console.error(error);
                }
            }

        } else {
            vscode.window.showErrorMessage(`Unknown command: ${mainCommand}`);
        }
    }

    private synth(args: string[]) {
        const currentProject = ProjectManager.instance.getActiveProject();
        const projectPath = currentProject?.projectRoot;
        if (!args.includes('logs') && projectPath) {
            runCommand(projectPath, 'make synth/' + args.join('/'))
        }
    }

    private route(args: string[]) {
    }

    private bitstream(args: string[]) {
    }

    private initializeRuns() {
        const createSubItem = (label: string, runCommand: string[], logCommand: string[]): RunItem =>
            new RunItem(label, RunStatus.Idle, vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, [
                new RunItem('Run ', RunStatus.Idle, vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'execution',
                        arguments: runCommand,
                        title:""
                    }, new vscode.ThemeIcon('debug-start')),
                new RunItem('Logs', RunStatus.Idle, vscode.TreeItemCollapsibleState.None, 
                    {
                        command: 'execution',
                        arguments: logCommand,
                        title:""
                    }, new vscode.ThemeIcon('info')),
            ]);

        this.runItems = [
            new RunItem('Synthesis', RunStatus.Idle, vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, [
                createSubItem('Transform', ['synth', 'transform'], ['synth', 'transform', "logs"]),
                createSubItem('Netlist', ['synth', 'netlist'], ['synth', 'netlist', "logs"]),
            ]),

            new RunItem('Implementation', RunStatus.Idle, vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, [
                createSubItem('Place', ['route', 'place'], ['route', 'place', "logs"]),
                createSubItem('Route', ['route', 'route'], ['route', 'route', "logs"]),
                createSubItem('Fasm', ['route', 'fasm'], ['route', 'fas', "logs"]),
            ]),

            createSubItem('Timing', ['timing'], ['timing', "logs"]),
            new RunItem('Generate Bitstream', RunStatus.Idle, vscode.TreeItemCollapsibleState.None, {
                command: 'execution',
                arguments: ['bitstream'],
                title: 'Generate Bitstream',
            }, new vscode.ThemeIcon('archive'))
        ];
    }

    async generateMakefile() {
        const currentProject = ProjectManager.instance.getActiveProject()

        if (!currentProject) {
            vscode.window.showErrorMessage('No selected project!');
            return;
        }

        if (!fs.existsSync(currentProject.projectInfoPath)) {
            return;
        }

        const info = fs.readFileSync(currentProject.projectInfoPath, 'utf-8');
        let content: ProjectInfo = JSON.parse(info);
        const topModule = content.topModule ? content.topModule : undefined

        if (!topModule || !content.projectRoot) {
            return;
        }
        let workspacePath = content.projectRoot 

        // Extract necessary data from the .prjinfo file
        const constraints: string[] = content.constraints || [];
        const sources: string[] = content.sourceFiles || [];
        const relativeSources = sources.map((source: string) => path.relative(workspacePath, source));
        const relativeConstraints = constraints.map((constraint: string) => path.relative(workspacePath, constraint));

        // Create Makefile content based on the parsed data
        let makefileContent: string = `# Automatically generated Makefile`
        const formattedTopModule = "\nTOP_MODULE = " + topModule + "\nTOP_FINAL = " + topModule + "\n"
        // const formattedSrcs = "\nSRCS = \\\n" + relativeSources.map(file => `\t${file} \\`).join("\n").slice(0, -2) + '\n';
        // const formattedConstraints = "\nPCF = \\\n" + relativeConstraints.map(file => `\t${file} \\`).join("\n").slice(0, -2) + '\n';

        const formattedSrcs = "\nSRCS = \\\n" + sources.map(file => `\t${file} \\`).join("\n").slice(0, -2) + '\n';
        const formattedConstraints = "\nPCF = \\\n" + constraints.map(file => `\t${file} \\`).join("\n").slice(0, -2) + '\n';

        makefileContent += formattedTopModule + formattedSrcs + formattedConstraints +
`
BASE_PATH := $(realpath $(dir $(lastword $(MAKEFILE_LIST))))
# SRCS := $(addprefix $(BASE_PATH)/, $(SRCS))

# SDC =

QL_FLAGS= \
	-d ql-eos-s3 \
	-P PU64 \
	-t top \
	-v $(SRCS) \
	-p $(PCF)

BUILDDIR = build
LOGFILE = $(BUILDDIR)/build.log
PARTNAME := PU64
DEVICE  := ql-eos-s3
FAMILY := pp3
ANALYSIS_CORNER := slow
PNR_CORNER := slow
PINMAP_CSV := $(BUILDDIR)/top_dummy.csv
DUMMY_SDC = $(BUILDDIR)/top_dummy.sdc

SYNT_FLAGS = \\
	-t $(TOP_MODULE) \\
	-v $(SRCS) \\
	-F $(FAMILY) \\
	-d $(DEVICE) \\
	-p $(PCF) \\
	-P $(PARTNAME)

#    -s $(SDC)

BITSTREAM = $(TOP_MODULE).bit

$(BUILDDIR)/$(TOP_MODULE).eblif: $(BUILDDIR) $(SRCS) $(PCF)
	cd $(BUILDDIR) && \\
	symbiflow_synth $(SYNT_FLAGS) 2>&1

$(BUILDDIR)/$(TOP_MODULE).sdc: $(BUILDDIR)/$(TOP_MODULE).eblif $(DUMMY_SDC) $(PINMAP_CSV)
	python3 -m f4pga.utils.quicklogic.process_sdc_constraints \\
		--sdc-in $(DUMMY_SDC) \\
		--sdc-out $@ \\
		--pcf $(PCF) \\
		--eblif $(BUILDDIR)/$(TOP_MODULE).eblif \\
		--pin-map $(PINMAP_CSV)

$(BUILDDIR)/$(TOP_MODULE).net: $(BUILDDIR)/$(TOP_MODULE).eblif $(BUILDDIR)/$(TOP_MODULE).sdc
	cd $(BUILDDIR) && \\
	symbiflow_pack \\
		-e $(TOP_MODULE).eblif \\
		-f $(FAMILY) \\
		-d $(DEVICE) \\
		-s $(BUILDDIR)/$(TOP_MODULE).sdc \\
		-c $(PNR_CORNER)

$(BUILDDIR)/$(TOP_MODULE).place: $(BUILDDIR)/$(TOP_MODULE).net $(PCF)
	cd $(BUILDDIR) && \\
	symbiflow_place \\
		-e $(TOP_MODULE).eblif \\
		-f $(FAMILY) \\
		-d $(DEVICE) \\
		-p $(PCF) \\
		-n $(TOP_MODULE).net \\
		-P $(PARTNAME) \\
		-s $(BUILDDIR)/$(TOP_MODULE).sdc \\
		-c $(PNR_CORNER)

$(BUILDDIR)/$(TOP_FINAL).route: $(BUILDDIR)/$(TOP_FINAL).place
	cd $(BUILDDIR) && \\
	symbiflow_route \\
		-e $(TOP_FINAL).eblif \\
		-f $(FAMILY) \\
		-d $(DEVICE) \\
		-s $(BUILDDIR)/$(TOP_MODULE).sdc \\
		-c $(PNR_CORNER)

$(BUILDDIR)/$(TOP_MODULE).post_v: $(BUILDDIR)/$(TOP_FINAL).route
	cd $(BUILDDIR) && \\
	symbiflow_analysis \\
		-e $(TOP_FINAL).eblif \\
		-f $(FAMILY) \\
		-d $(DEVICE) \\
		-s $(BUILDDIR)/$(TOP_MODULE).sdc \\
		-t $(TOP_MODULE) \\
		-c $(ANALYSIS_CORNER)

$(BUILDDIR)/$(TOP_MODULE).fasm: $(BUILDDIR)/$(TOP_FINAL).route
	cd $(BUILDDIR) && \\
	symbiflow_write_fasm \\
		-e $(TOP_FINAL).eblif \\
		-f $(FAMILY) \\
		-d $(DEVICE) \\
		-s $(BUILDDIR)/$(TOP_MODULE).sdc \\
		-c $(PNR_CORNER)

$(BUILDDIR)/$(TOP_MODULE).bit: $(BUILDDIR)/$(TOP_MODULE).fasm
	cd $(BUILDDIR) && \\
    symbiflow_generate_bitstream \\
        -d $(DEVICE) \\
        -f $(TOP_MODULE).fasm \\
        -b $(TOP_MODULE).bit

$(BUILDDIR):
\tmkdir -p $(BUILDDIR)
\t[ ! -f $(DUMMY_SDC) ] && touch $(DUMMY_SDC) || true
\t[ ! -f $(PINMAP_CSV) ] && touch $(PINMAP_CSV) || true

synth/transform: $(BUILDDIR)/$(TOP_MODULE).eblif
synth/netlist: $(BUILDDIR)/$(TOP_MODULE).net
synth: synth/netlist

route/place: $(BUILDDIR)/$(TOP_MODULE).place
route/route: $(BUILDDIR)/$(TOP_MODULE).route
route/fasm: $(BUILDDIR)/$(TOP_MODULE).fasm
route/post: $(BUILDDIR)/$(TOP_MODULE).post_v
route:route/fasm route/post

bitstream: route $(BUILDDIR)/$(TOP_MODULE).bit

all: bitstream

all2:
	ql_symbiflow -compile $(QL_FLAGS) -dump binary

        `;

        const makefilePath = path.join(workspacePath, 'Makefile');
        fs.writeFileSync(makefilePath, makefileContent, 'utf-8');
        vscode.window.showInformationMessage('Makefile has been generated based on .prjinfo content.');
    }

    private initializeWatcher() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const prjInfoPath = path.join(workspaceFolder.uri.fsPath, '.prjinfo');
        this.prjInfoWatcher = vscode.workspace.createFileSystemWatcher(prjInfoPath);

        this.prjInfoWatcher.onDidChange(() => this.generateMakefile());
        this.prjInfoWatcher.onDidCreate(() => this.generateMakefile());
        this.prjInfoWatcher.onDidDelete(() => this.generateMakefile());
    }

    getTreeItem(element: RunItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: RunItem): vscode.ProviderResult<RunItem[]> {
        return element?.children || this.runItems;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
        this.generateMakefile();
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}

function waitForExitStatus(terminal: vscode.Terminal): Promise<number> {
    return new Promise((resolve, reject) => {
        const checkExitStatus = setInterval(() => {
            const exitStatus = terminal.exitStatus;
            if (exitStatus && typeof exitStatus.code === 'number') {
                clearInterval(checkExitStatus);
                resolve(exitStatus.code); // Resolve with the exit code (guaranteed to be a number)
            }
        }, 100); // Check every 100ms

        // Optional: Add a timeout to prevent indefinite waiting
        setTimeout(() => {
            clearInterval(checkExitStatus);
            reject(new Error('Timeout waiting for terminal exit status.'));
        }, 60000 * 60 * 1); // 1 hour
    });
}

export async function runCommand(workspace: string, buildCommand: string): Promise<number> {
    // Create a terminal for the command
    const terminal = vscode.window.createTerminal(`Build Command: ${buildCommand}`);
    terminal.show();

    // Construct the full shell command to set up the environment and run the build command
    const command = 
        `export F4PGA_INSTALL_DIR=/opt/f4pga;
        export FPGA_FAM=eos-s3;
        source "$F4PGA_INSTALL_DIR/$FPGA_FAM/conda/etc/profile.d/conda.sh";
        conda activate eos-s3;
        cd ${workspace};
        ${buildCommand};
        exit $?
    `;

    // Send the constructed command to the terminal
    terminal.sendText(command, true);

    // Wait for the terminal to have an exitStatus
    const exitCode = await waitForExitStatus(terminal);

    return exitCode;
}


// import { exec } from 'child_process';

// export function runCommand(workspace: string, buildCommand: string): Promise<number> {
//     return new Promise((resolve, reject) => {
//         const command = `
//             export F4PGA_INSTALL_DIR=/opt/f4pga;
//             export FPGA_FAM=eos-s3;
//             source "$F4PGA_INSTALL_DIR/$FPGA_FAM/conda/etc/profile.d/conda.sh";
//             conda activate eos-s3;
//             cd ${workspace};
//             ${buildCommand};
//             exit $?;
//         `;

//         // Use `exec` to run the command
//         exec(command, (error, stdout, stderr) => {
//             if (error) {
//                 console.error(`Error: ${stderr}`);
//                 reject(error.code || 1); // Reject with the exit code or 1
//             } else {
//                 terminal.log(`Output: ${stdout}`);
//                 resolve(0); // Resolve with the exit code 0
//             }
//         });
//     });
// }


// import { spawn } from 'child_process';

// export function runCommand(workspace: string, buildCommand: string): Promise<number> {
//     return new Promise((resolve, reject) => {
//         // Create a VSCode terminal
//         const terminal = vscode.window.createTerminal(`Build Command`);
//         terminal.show();

//         // Construct the full shell command
//         const command = `
//             export F4PGA_INSTALL_DIR=/opt/f4pga;
//             export FPGA_FAM=eos-s3;
//             source "$F4PGA_INSTALL_DIR/$FPGA_FAM/conda/etc/profile.d/conda.sh";
//             conda activate eos-s3;
//             cd ${workspace};
//             ${buildCommand};
//             exit $?;
//         `;

//         // Spawn the process
//         const childProcess = spawn(command, {
//             shell: true,
//             env: process.env,
//         });

//         // Redirect stdout to the VSCode terminal
//         childProcess.stdout.on('data', (data) => {
//             terminal.sendText(data.toString(), true);
//         });

//         // Redirect stderr to the VSCode terminal
//         childProcess.stderr.on('data', (data) => {
//             terminal.sendText(data.toString(), true);
//         });

//         // Handle process exit
//         childProcess.on('close', (code) => {
//             if (code === 0) {
//                 resolve(code);
//             } else {
//                 reject(code);
//             }
//             terminal.sendText(`@echo Process exited with code ${code}`, true);
//         });

//         // Handle process errors
//         childProcess.on('error', (error) => {
//             terminal.sendText(`Error: ${error.message}`, true);
//             reject(-1);
//         });
//     });
// }
