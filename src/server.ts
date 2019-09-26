import { createConnection, StreamMessageWriter, StreamMessageReader } from 'vscode-languageserver';

// Create a connection
const connection = createConnection(
	new StreamMessageReader(process.stdin),
	new StreamMessageWriter(process.stdout)
);
