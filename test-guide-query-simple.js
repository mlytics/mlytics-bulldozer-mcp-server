#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  // Start the server as a child process
  const serverProcess = spawn('node', ['mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });
  
  // Create a transport that communicates with the server
  const transport = new StdioClientTransport(serverProcess.stdin, serverProcess.stdout);
  
  // Create a client using the transport
  const client = new Client(transport);
  
  try {
    // Connect to the server
    await client.connect();
    console.log('Connected to server');
    
    // Get available tools
    const tools = await client.listTools();
    console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
    
    // Call the query-guide tool with text format
    console.log('Calling query-guide tool...');
    const result = await client.callTool('query-guide', {
      format: 'text'
    });
    
    // Parse and display the result
    const response = JSON.parse(result.content[0].text);
    console.log('Success:', response.success);
    console.log('Message:', response.message);
    console.log('Sections:', Object.keys(response.data.sections).length);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    console.log('Closing connection...');
    await client.close();
    serverProcess.kill();
    console.log('Done');
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});