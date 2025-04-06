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
  // Set up the time range for the last 7 days
  const now = Math.floor(Date.now() / 1000);
  const oneWeekAgo = now - (7 * 24 * 60 * 60);
  
  console.log(`Time range: ${new Date(oneWeekAgo * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
  
  // Get DNS query usage data
  console.log('\n--- Get DNS Query Usage Data ---');
  const dnsResult = await client.callTool('get-historical-reports', {
    org_id: '1001642588942', // Example organization ID
    usage_type: 'dns_query_usage_sum',
    start_time: oneWeekAgo,
    end_time: now,
    convert_milli_timestamp: true
  });
  
  console.log('Result:', dnsResult.content[0].text);
  
  // Get CDN request data
  console.log('\n--- Get CDN Request Data ---');
  const requestResult = await client.callTool('get-historical-reports', {
    org_id: '1001642588942', // Example organization ID
    usage_type: 'cdn_request_sum',
    start_time: oneWeekAgo,
    end_time: now,
    convert_milli_timestamp: false
  });
  
  console.log('Result:', requestResult.content[0].text);
  
} catch (error) {
  console.error('Error:', error);
}

// Close the client and server process.
await client.close();
serverProcess.kill();