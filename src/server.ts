import {
	createConnection,
	StreamMessageWriter,
	StreamMessageReader,
	TextDocuments,
	DidChangeConfigurationNotification,
	TextDocumentPositionParams,
	CompletionItem,
	CompletionItemKind,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
} from 'vscode-languageserver';
import * as ts from 'typescript/lib/tsserverlibrary';

// Log a welcome message
process.stderr.write('altss started!\n');

// Create a connection
const connection = createConnection(
	new StreamMessageReader(process.stdin),
	new StreamMessageWriter(process.stdout)
);

// Construct TypeScript ProjectService
const projectService = new ts.server.ProjectService({
	host: <ts.server.ServerHost>ts.sys,
	logger: {
		close() {},
		hasLevel(level: ts.server.LogLevel) {
			return true;
		},
		loggingEnabled() {
			return true;
		},
		perftrc(s: string) {},
		info(s: string) {
			connection.console.log(s);
		},
		startGroup() {},
		endGroup() {},
		msg(s: string, type?: ts.server.Msg) {
			connection.console.log(s);
		},
		getLogFileName() {
			return undefined;
		},
	},
	cancellationToken: ts.server.nullCancellationToken,
	useSingleInferredProject: false,
	useInferredProjectPerProjectRoot: false,
	typingsInstaller: ts.server.nullTypingsInstaller,
});

// Simple text document manager
const documents = new TextDocuments();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize(params => {
	let capabilities = params.capabilities;

	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				save: {
					includeText: false,
				},
				change: documents.syncKind,
			},
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: ['.'],
			},
			hoverProvider: true,
		},
	};
});

connection.onInitialized(() => {
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	connection.console.log(`Contents changed for ${change.document.uri}`);
});

documents.onDidOpen(change => {
	connection.console.log(`Document opened ${change.document.uri}`);
	projectService.openClientFile(change.document.uri.replace('file://', ''));
});

documents.onDidClose(change => {
	connection.console.log(`Document closed ${change.document.uri}`);
	projectService.openClientFile(change.document.uri.replace('file://', ''));
});

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	connection.console.log('Completion request');
	// The passed parameter contains the position of the text document in
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	return [
		{
			label: 'TypeScript',
			kind: CompletionItemKind.Text,
			data: 1,
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2,
		},
	];
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

// Hover handler
connection.onHover(position => {
	const path = position.textDocument.uri.replace('file://', '');
	const scriptInfo = projectService.getScriptInfoForNormalizedPath(
		ts.server.toNormalizedPath(path)
	);
	const project = projectService.getDefaultProjectForFile(
		ts.server.toNormalizedPath(path),
		false
	);
	if (!scriptInfo || !project) return null;

	const info = project
		.getLanguageService()
		.getQuickInfoAtPosition(
			scriptInfo.fileName,
			scriptInfo.lineOffsetToPosition(
				position.position.line + 1,
				position.position.character + 1
			)
		);
	if (!info) return null;

	return {
		contents: [
			{
				language: 'typescript',
				value: ts.displayPartsToString(info.displayParts).replace(/^\(.+?\)\s+/, ''),
			},
			`**${info.kind}**`,
			ts.displayPartsToString(info.documentation),
		],
	};
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
