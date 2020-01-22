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

const actionCreatorDefinitionsGlob = '**/action-creators{**/*, *}.js';
const actionConsumersGlob = '**/store/**/*.js';

const functionDeclarationRE = /(?<=\bfunction\s+)\w+/;
const actionTypeRE = /\s+(?<=return\s+\{[\w\s]+type:\s)[A-Z_]+/;
const createActionCreatorRE = /createActionCreator\(/;
const createActionCreatorTypeRE = /(?<=createActionCreator\(\s*)\w+/;
const createActionCreatorNameRE = /(?<=const\s)\w+(?=\s=\screateActionCreator\(\s*\w+)/;
const usageFileNameFilterRE = /(action-creators|-tests|types)(\/[\w-]+)*\.js$/;

let actionCreators: ActionCreators = {};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const actionCreatorDefinitionFiles = await vscode.workspace.findFiles(actionCreatorDefinitionsGlob);
	let actionConsumerFiles = await vscode.workspace.findFiles(actionConsumersGlob);

	if(!actionCreatorDefinitionFiles.length || !actionConsumerFiles.length) {
		return;
	}
	
  actionConsumerFiles = actionConsumerFiles.filter(file => !usageFileNameFilterRE.test(file.path));

	for(const fileDescriptor of actionCreatorDefinitionFiles) {
		const definitionDocument = await vscode.workspace.openTextDocument(fileDescriptor.path);

    let currentPosition = new vscode.Position(0,0);
		let line = definitionDocument.lineAt(currentPosition);
		const endPosition = new vscode.Position(definitionDocument.lineCount + 1, 0);

		while(line.lineNumber < definitionDocument.lineCount - 1) {
			let actionType;
			let actionCreatorName;

			const nextText = definitionDocument.getText(new vscode.Range(currentPosition, endPosition));
			const functionDeclarationMatches = functionDeclarationRE.exec(line.text);
			const createActionCreatorsMatches = createActionCreatorRE.test(line.text);

			if(functionDeclarationMatches) {
				const typeMatch = nextText.match(actionTypeRE);
	
				if(typeMatch?.length) {
					actionType = typeMatch[0].trim();
				  actionCreatorName = functionDeclarationMatches[0].trim();
				}	
			} else if(createActionCreatorsMatches) {
				const typeMatch = nextText.match(createActionCreatorTypeRE);

        if(typeMatch?.length) {
					actionType = typeMatch[0].trim();
					actionCreatorName = nextText.match(createActionCreatorNameRE)?.[0]?.trim();
				}
			}

      if(actionType && actionCreatorName) {
				for(const actionConsumerFileDescriptor of actionConsumerFiles) {
					const actionConsumerDocument = await vscode.workspace.openTextDocument(actionConsumerFileDescriptor.path);
					const actionConsumerFileText = actionConsumerDocument.getText();

					let cursor = actionConsumerFileText.indexOf(actionType);

					while(cursor !== -1) {
						if(!actionCreators[actionCreatorName]) {
							actionCreators[actionCreatorName] = { 
								type: actionType, 
								usages: [], 
								usagesPerUri: {} 
							};
						}

						const uri = actionConsumerFileDescriptor.path;
						const documentPosition = actionConsumerDocument.positionAt(cursor);
						const { usagesPerUri } = actionCreators[actionCreatorName];

						usagesPerUri[uri] = (usagesPerUri[uri] || 0) + 1;

						// skip the first usage as we assume that is the import of the action type
						if(usagesPerUri[uri] > 1) {
							actionCreators[actionCreatorName].usages.push({
								uri, 
								line: documentPosition.line, 
								character: documentPosition.character
							});
						}

						cursor = actionConsumerFileText.indexOf(actionType, cursor + actionType.length);
					}
				}
			}

			currentPosition = currentPosition.translate(1);
			line = definitionDocument.lineAt(currentPosition);
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
