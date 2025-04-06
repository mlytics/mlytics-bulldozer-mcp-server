import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

// Create a new client with a stdio transport.
const serverProcess = spawn('node', ['mcp-server.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

const transport = new StdioClientTransport(serverProcess.stdin, serverProcess.stdout);
const client = new Client(transport);

// Connect to the server.
await client.connect();

try {
  // First, check what tools are available
  const tools = await client.listTools();
  console.log('Available tools:', tools.tools.map(t => t.name));
  
  // Simple call to query-guide
  const result = await client.callTool('query-guide', {});
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error);
} finally {
  // Close the client and server process.
  await client.close();
  serverProcess.kill();
}