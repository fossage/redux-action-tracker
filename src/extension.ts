// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface ActionTypeUsage {
	uri: string;
	line: number;
	character: number;
}

interface ActionCreators {
	[key: string]: {
		type: string;
		usages: ActionTypeUsage[];
		usagesPerUri: {[key: string]: number};
	};
}

const findGlob = '**/action-creators{**/*, *}.js';
const usagesGlob = '**/store/**/*.js';

const functionDeclarationRE = /(?<=\bfunction\s+)\w+/;
const actionTypeRE = /\s+(?<=return\s+\{[\w\s]+type:\s)[A-Z_]+/;
const createActionCreatorRE = /createActionCreator\(/;
const createActionCreatorTypeRE = /(?<=createActionCreator\(\s*)\w+/;
const createActionCreatorNameRE = /(?<=const\s)\w+(?=\s=\screateActionCreator\(\s*\w+)/;

let actionCreators: ActionCreators = {};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const files = await vscode.workspace.findFiles(findGlob);
	let usageFiles = await vscode.workspace.findFiles(usagesGlob);

	if(!files.length || !usageFiles.length) {
		return;
	}
	
  usageFiles = usageFiles.filter(file => !/(action-creators|-tests|types)(\/\w+)*\.js$/.test(file.path));

	for(const fileDescriptor of files) {
		const doc = await vscode.workspace.openTextDocument(fileDescriptor.path);
		const text = doc.getText();
		
		let cursor = -1;
    let position = new vscode.Position(0,0);
		let line = doc.lineAt(position);

		while(line.lineNumber < doc.lineCount - 1) {
			let type;
			let actionCreatorName;

			const nextText = text.slice(cursor);
			const functionDeclarationMatches = functionDeclarationRE.exec(line.text);
			const createActionCreatorsMatches = createActionCreatorRE.test(line.text);

			if(functionDeclarationMatches) {
				const typeMatch = nextText.match(actionTypeRE);
	
				if(typeMatch?.length) {
					type = typeMatch[0].trim();
				  actionCreatorName = functionDeclarationMatches[0].trim();
				}	
			} else if(createActionCreatorsMatches) {
				const typeMatch = nextText.match(createActionCreatorTypeRE);

        if(typeMatch?.length) {
					type = typeMatch[0].trim();
					actionCreatorName = nextText.match(createActionCreatorNameRE)?.[0]?.trim();
				}
			}

      if(type && actionCreatorName) {
				for(const usageFileDescriptor of usageFiles) {
					const doc = await vscode.workspace.openTextDocument(usageFileDescriptor.path);
					const text = doc.getText();

					let position = text.indexOf(type);

					while(position !== -1) {
						if(!actionCreators[actionCreatorName]) {
							actionCreators[actionCreatorName] = { 
								type, 
								usages: [], 
								usagesPerUri: {} 
							};
						}

						const pos = doc.positionAt(position);
						const uri = usageFileDescriptor.path;
						const { usagesPerUri } = actionCreators[actionCreatorName];
						usagesPerUri[uri] = usagesPerUri[uri] ? usagesPerUri[uri] + 1 : 1;

						// skip the first usage as we assume that is the import of the action type
						if(usagesPerUri[uri] > 1) {
							actionCreators[actionCreatorName].usages.push({
								uri, 
								line: pos.line, 
								character: pos.character
							});
						}

						position = text.indexOf(type, position + type.length);
					}
				}
			}
			
			cursor += line.text.length + 1;
			position = position.translate(1);
			line = doc.lineAt(position);
		}
	}

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
}

// this method is called when your extension is deactivated
export function deactivate() {}
