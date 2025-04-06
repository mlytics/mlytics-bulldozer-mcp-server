#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  // Start the server as a child process
  console.log('Starting MCP server...');
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
    
    // Test the capacity-forecast tool with default parameters
    console.log('Testing capacity forecast for DNS query usage...');
    const dnsQueryResult = await client.callTool('capacity-forecast', {
      org_id: '1001642588942', // Sample organization ID
      usage_type: 'dns_query_usage_sum',
      // Using default values for other parameters
    });
    
    // Parse and display a summary of the results
    const dnsResponse = JSON.parse(dnsQueryResult.content[0].text);
    if (dnsResponse.success) {
      const forecast = dnsResponse.data.forecast;
      console.log('\nDNS Query Usage Forecast Summary:');
      console.log('--------------------------------');
      console.log(`Current Usage: ${forecast.capacity.current_usage_percent}% of capacity`);
      
      if (forecast.capacity.warning_breach_date) {
        console.log(`Warning Threshold Breach: ${new Date(forecast.capacity.warning_breach_date).toLocaleDateString()}`);
      } else {
        console.log('Warning Threshold Breach: None projected within forecast period');
      }
      
      if (forecast.capacity.critical_breach_date) {
        console.log(`Critical Threshold Breach: ${new Date(forecast.capacity.critical_breach_date).toLocaleDateString()}`);
      } else {
        console.log('Critical Threshold Breach: None projected within forecast period');
      }
      
      console.log('\nGrowth Metrics:');
      console.log(`30-Day Growth: ${forecast.growth_metrics.next_30_days_growth_pct}%`);
      console.log(`90-Day Growth: ${forecast.growth_metrics.next_90_days_growth_pct}%`);
      
      console.log('\nRecommendations:');
      forecast.recommendations.forEach(rec => {
        console.log(`[${rec.type.toUpperCase()}] ${rec.title}: ${rec.message}`);
      });
      
      // Test with CDN traffic and customized parameters
      console.log('\nTesting capacity forecast for CDN traffic with custom parameters...');
      const cdnTrafficResult = await client.callTool('capacity-forecast', {
        org_id: '1001642588942',
        usage_type: 'cdn_traffic_sum',
        historical_days: 60,
        forecast_days: 120,
        growth_rate: 0.1, // 10% monthly growth
        include_seasonality: true,
        threshold_warning: 0.6, // 60% capacity warning
        threshold_critical: 0.85 // 85% capacity critical
      });
      
      const trafficResponse = JSON.parse(cdnTrafficResult.content[0].text);
      if (trafficResponse.success) {
        const trafficForecast = trafficResponse.data.forecast;
        console.log('\nCDN Traffic Forecast Summary:');
        console.log('-----------------------------');
        console.log(`Current Usage: ${trafficForecast.capacity.current_usage_percent}% of capacity`);
        
        if (trafficForecast.capacity.recommended_increase.increase_amount > 0) {
          console.log('\nCapacity Upgrade Recommendation:');
          console.log(`Increase Amount: ${trafficForecast.capacity.recommended_increase.increase_amount}`);
          console.log(`Increase Percentage: ${trafficForecast.capacity.recommended_increase.increase_percent}%`);
          console.log(`New Capacity: ${trafficForecast.capacity.recommended_increase.new_capacity}`);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    console.log('\nClosing connection...');
    await client.close();
    serverProcess.kill();
    console.log('Done');
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});