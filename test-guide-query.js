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

// Get the list of available tools.
const { tools } = await client.listTools();
console.log('Available tools:', tools.map(tool => tool.name));

try {
  // First, query the Guide table of contents
  console.log('\n--- Guide Table of Contents ---');
  const tocResult = await client.callTool('query-guide', {
    format: 'markdown'
  });
  
  console.log('Result:', tocResult.content[0].text);
  
  // Now search for a keyword
  console.log('\n--- Search for "authentication" ---');
  const searchResult = await client.callTool('query-guide', {
    keyword: 'authentication',
    format: 'text'
  });
  
  console.log('Result:', searchResult.content[0].text);
  
  // Get a specific section
  console.log('\n--- Get Authentication Methods Section ---');
  const sectionResult = await client.callTool('query-guide', {
    section: 'Authentication Methods',
    format: 'json'
  });
  
  console.log('Result:', sectionResult.content[0].text);
  
} catch (error) {
  console.error('Error:', error);
}

// Close the client and server process.
await client.close();
serverProcess.kill();