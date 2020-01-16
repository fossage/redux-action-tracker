// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const findGlob = '**/action-creators.js';
const usagesGlob = '**/store/**/*.js';
const functionDeclarationRE = /(?<=\bfunction\s+)\w+/;
const actionTypeRE = /\s+(?<=return\s+\{[\w\s]+type:\s)[A-Z_]+/;


interface ActionTypeUsage {
	uri: string;
	line: number;
	character: number;
}

interface ActionCreators {
	[key: string]: {
		type: string;
		usages: ActionTypeUsage[];
	};
}

let actionCreators: ActionCreators = {};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const files = await vscode.workspace.findFiles(findGlob);
	const usageFiles = await vscode.workspace.findFiles(usagesGlob);

	if(!files.length || !usageFiles.length) {
		return;
	}
	
	for(const fileDescriptor of files) {
		const doc = await vscode.workspace.openTextDocument(fileDescriptor.path);
		const text = doc.getText();
		
		let cursor = -1;
    let position = new vscode.Position(0,0);
		let line = doc.lineAt(position);

		while(line.lineNumber < doc.lineCount - 1) {
			const matches = functionDeclarationRE.exec(line.text);

			if(matches) {
				const typeMatch = text.slice(cursor).match(actionTypeRE);

				if(typeMatch?.length) {
					const actionCreatorName = matches[0].trim();
					const type = typeMatch[0].trim();
	
					actionCreators[actionCreatorName] = { type, usages: [] };
	
					for(const usageFileDescriptor of usageFiles) {
						const doc = await vscode.workspace.openTextDocument(usageFileDescriptor.path);
						
						let text = doc.getText();
						let position = text.indexOf(type);
	
						while(position !== -1) {
							const pos = doc.positionAt(position);
							actionCreators[actionCreatorName].usages.push({uri: usageFileDescriptor.path, line: pos.line, character: pos.character});
							position = text.indexOf(type, position + type.length);
						}
					}
				}	
			}
			
			cursor += line.text.length + 1;
			position = position.translate(1);
			line = doc.lineAt(position);
		}
	}
			
	const temp = actionCreators;
	actionCreators = {};
	Object.keys(temp).forEach(key => {
		if(temp[key].usages.length) {
			actionCreators[key] = temp[key];
		}
	});
	
	vscode.languages.registerHoverProvider('javascript', {
    provideHover(document, position, token) {
			const wordRange = document.getWordRangeAtPosition(position);
			if(!wordRange) {
				return;
			}

			const text = document.getText(wordRange);
			if(!actionCreators[text]) {
				return;
			}

			let output = '';

			for(const usage of actionCreators[text].usages) {
				output += `[${vscode.workspace.asRelativePath(usage.uri)}](${usage.uri}#${usage.line + 1})\n\n`;
			}

      return new vscode.Hover(output);
    }
  });

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello VS Code!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
