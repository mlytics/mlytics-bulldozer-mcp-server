// CDN MCP Server implementation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as crypto from 'crypto';
import axios from 'axios';

// Initialize MCP Server
const server = new Server(
  {
    name: 'mlytics-cdn-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Schema definitions for tool requests
const CreateSiteSchema = z.object({
  domain: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  cdnProviders: z.array(z.string()).optional(),
});

const AddDnsRecordSchema = z.object({
  siteId: z.string(),
  name: z.string(),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
  ttl: z.number().optional(),
  values: z.array(z.string()),
});

const UpdateDomainSchema = z.object({
  domain: z.string(),
  settings: z.object({
    cdn_settings: z.object({
      enable_cache: z.boolean().optional(),
      cache_ttl: z.number().optional(),
      query_string_handling: z.enum(['ignore', 'include', 'exclude']).optional(),
    }).optional(),
    security_settings: z.object({
      enable_waf: z.boolean().optional(),
      block_bad_bots: z.boolean().optional(),
      enable_rate_limiting: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

const UpdateStrategySchema = z.object({
  strategyType: z.enum(['geo', 'performance', 'cost', 'availability', 'hybrid']),
  settings: z.object({
    weights: z.object({
      performance: z.number().min(0).max(100).optional(),
      cost: z.number().min(0).max(100).optional(),
      reliability: z.number().min(0).max(100).optional(),
    }).optional(),
    geo_rules: z.array(
      z.object({
        region: z.string(),
        preferred_cdn: z.string(),
      })
    ).optional(),
    fallback_cdn: z.string().optional(),
  }).optional(),
});

const GetPerformanceDataSchema = z.object({
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).optional(),
  cdn: z.string().optional(),
  region: z.string().optional(),
});

// Data storage paths
const dataDir = path.join(os.homedir(), '.mlytics-cdn-mcp');
const sitesFile = path.join(dataDir, 'sites.json');
const dnsRecordsFile = path.join(dataDir, 'dns_records.json');
const strategyFile = path.join(dataDir, 'strategy.json');
const performanceDataFile = path.join(dataDir, 'performance_data.json');

// Ensure data directory exists
const ensureDataDirExists = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
};

// Helper to load data from file or return default
const loadDataOrDefault = async (filePath, defaultData) => {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return defaultData;
  }
};

// Helper to save data to file
const saveData = async (filePath, data) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

// Mock CDN providers
const CDN_PROVIDERS = [
  { id: 'cloudflare', name: 'Cloudflare', status: 'active' },
  { id: 'akamai', name: 'Akamai', status: 'active' },
  { id: 'fastly', name: 'Fastly', status: 'active' },
  { id: 'cloudfront', name: 'AWS CloudFront', status: 'active' },
  { id: 'mlytics', name: 'Mlytics', status: 'active' }
];

// Mock regions
const REGIONS = [
  'us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 
  'ap-southeast', 'sa-east', 'af-south', 'au-southeast'
];

// Generate mock performance data
const generateMockPerformanceData = (timeRange = '24h', cdn, region) => {
  const now = Date.now();
  const timeRangeInHours = {
    '1h': 1,
    '6h': 6,
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30
  }[timeRange];
  
  const intervals = timeRangeInHours * 4; // 15-minute intervals
  const data = [];
  
  const cdnProviders = cdn ? [CDN_PROVIDERS.find(p => p.id === cdn)].filter(Boolean) : CDN_PROVIDERS;
  const regions = region ? [region] : REGIONS;
  
  for (let i = 0; i < intervals; i++) {
    const timestamp = new Date(now - (timeRangeInHours * 3600000) + (i * 3600000 / 4)).toISOString();
    
    for (const provider of cdnProviders) {
      for (const reg of regions) {
        // Base latency in ms - varies by region and CDN
        let baseLatency = 
          provider.id === 'cloudflare' ? 50 : 
          provider.id === 'akamai' ? 55 : 
          provider.id === 'fastly' ? 45 : 
          provider.id === 'cloudfront' ? 60 : 70;
        
        // Adjust by region
        if (reg.startsWith('us-')) baseLatency *= 0.9;
        if (reg.startsWith('eu-')) baseLatency *= 1.1;
        if (reg.startsWith('ap-')) baseLatency *= 1.2;
        if (reg.startsWith('sa-')) baseLatency *= 1.3;
        if (reg.startsWith('af-')) baseLatency *= 1.4;
        if (reg.startsWith('au-')) baseLatency *= 1.25;
        
        // Add some variation
        const latencyVariation = Math.sin(i * 0.5) * 15; // Sinusoidal variation
        const randomVariation = (Math.random() - 0.5) * 20; // Random noise
        const latency = Math.max(20, baseLatency + latencyVariation + randomVariation);
        
        // Calculate availability (occasional dips, mostly high)
        const baseAvailability = 
          provider.id === 'cloudflare' ? 99.95 : 
          provider.id === 'akamai' ? 99.9 : 
          provider.id === 'fastly' ? 99.98 : 
          provider.id === 'cloudfront' ? 99.93 : 99.85;
        
        // Occasional availability dips
        const availabilityDip = Math.random() < 0.05 ? Math.random() * 1.5 : 0;
        const availability = Math.min(100, Math.max(98, baseAvailability - availabilityDip));
        
        // Calculate request count
        const baseRequestCount = 1000 + Math.random() * 5000;
        const requestCount = Math.floor(baseRequestCount * (1 + Math.sin(i * 0.2) * 0.3));
        
        data.push({
          timestamp,
          cdnId: provider.id,
          cdnName: provider.name,
          region: reg,
          latency,
          availability,
          requestCount,
          success: requestCount * (availability / 100),
          errors: requestCount * (1 - availability / 100)
        });
      }
    }
  }
  
  return data;
};

// Generate mock cost data
const generateMockCostData = (timeRange = '24h', cdn) => {
  const cdnProviders = cdn ? [CDN_PROVIDERS.find(p => p.id === cdn)].filter(Boolean) : CDN_PROVIDERS;
  const costData = [];
  
  for (const provider of cdnProviders) {
    const baseCost = 
      provider.id === 'cloudflare' ? 0.02 : 
      provider.id === 'akamai' ? 0.025 : 
      provider.id === 'fastly' ? 0.018 : 
      provider.id === 'cloudfront' ? 0.022 : 0.015;
    
    const baseTraffic = 10000; // 10TB base traffic
    const trafficMultiplier = Math.random() * 0.4 + 0.8; // 0.8-1.2 multiplier
    
    costData.push({
      cdnId: provider.id,
      cdnName: provider.name,
      timeRange,
      costPerGB: baseCost,
      trafficGB: Math.floor(baseTraffic * trafficMultiplier),
      totalCost: Math.floor(baseTraffic * trafficMultiplier * baseCost * 100) / 100
    });
  }
  
  return costData;
};

// Function to calculate best CDN per region based on collected data
const calculateOptimalStrategy = async () => {
  // Load current strategy
  const currentStrategy = await loadDataOrDefault(strategyFile, {
    strategyType: 'hybrid',
    settings: {
      weights: {
        performance: 50,
        cost: 30,
        reliability: 20
      },
      fallback_cdn: 'cloudflare'
    }
  });
  
  // Generate performance data for all CDNs and regions
  const performanceData = generateMockPerformanceData('24h');
  
  // Generate cost data
  const costData = generateMockCostData('24h');
  
  // Calculate scores for each CDN in each region
  const scores = {};
  
  // Group performance data by region and CDN
  const performanceByRegionAndCdn = {};
  
  for (const entry of performanceData) {
    const { region, cdnId } = entry;
    
    if (!performanceByRegionAndCdn[region]) {
      performanceByRegionAndCdn[region] = {};
    }
    
    if (!performanceByRegionAndCdn[region][cdnId]) {
      performanceByRegionAndCdn[region][cdnId] = [];
    }
    
    performanceByRegionAndCdn[region][cdnId].push(entry);
  }
  
  // Calculate average metrics for each region and CDN
  const averageMetrics = {};
  
  for (const region of Object.keys(performanceByRegionAndCdn)) {
    averageMetrics[region] = {};
    
    for (const cdnId of Object.keys(performanceByRegionAndCdn[region])) {
      const entries = performanceByRegionAndCdn[region][cdnId];
      
      const totalLatency = entries.reduce((sum, entry) => sum + entry.latency, 0);
      const totalAvailability = entries.reduce((sum, entry) => sum + entry.availability, 0);
      
      const avgLatency = totalLatency / entries.length;
      const avgAvailability = totalAvailability / entries.length;
      
      // Find cost data for this CDN
      const costEntry = costData.find(c => c.cdnId === cdnId);
      const costPerGB = costEntry ? costEntry.costPerGB : 0.02; // Default if not found
      
      averageMetrics[region][cdnId] = {
        latency: avgLatency,
        availability: avgAvailability,
        costPerGB
      };
    }
  }
  
  // Calculate scores based on weights
  const { weights } = currentStrategy.settings;
  
  for (const region of Object.keys(averageMetrics)) {
    scores[region] = {};
    
    // Find min/max values for normalization
    const metrics = Object.values(averageMetrics[region]);
    const minLatency = Math.min(...metrics.map(m => m.latency));
    const maxLatency = Math.max(...metrics.map(m => m.latency));
    const minCost = Math.min(...metrics.map(m => m.costPerGB));
    const maxCost = Math.max(...metrics.map(m => m.costPerGB));
    
    for (const cdnId of Object.keys(averageMetrics[region])) {
      const metrics = averageMetrics[region][cdnId];
      
      // Normalize values (0-100 where 100 is best)
      const latencyScore = maxLatency === minLatency ? 100 : 100 - ((metrics.latency - minLatency) / (maxLatency - minLatency) * 100);
      const costScore = maxCost === minCost ? 100 : 100 - ((metrics.costPerGB - minCost) / (maxCost - minCost) * 100);
      const availabilityScore = metrics.availability;
      
      // Calculate weighted score
      const totalScore = 
        (latencyScore * weights.performance / 100) +
        (costScore * weights.cost / 100) +
        (availabilityScore * weights.reliability / 100);
      
      scores[region][cdnId] = totalScore;
    }
  }
  
  // Determine best CDN for each region
  const optimalStrategy = {
    strategyType: 'hybrid',
    settings: {
      weights: { ...weights },
      geo_rules: [],
      fallback_cdn: currentStrategy.settings.fallback_cdn
    }
  };
  
  for (const region of Object.keys(scores)) {
    const cdnScores = scores[region];
    const bestCdn = Object.keys(cdnScores).reduce((a, b) => cdnScores[a] > cdnScores[b] ? a : b);
    
    optimalStrategy.settings.geo_rules.push({
      region,
      preferred_cdn: bestCdn
    });
  }
  
  // Save the optimal strategy
  await saveData(strategyFile, optimalStrategy);
  
  return optimalStrategy;
};

// Set up the list of available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create-cdn-site',
        description: 'Create a new CDN site with specified domain and CDN providers',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            cdnProviders: { 
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'add-dns-record',
        description: 'Add a DNS record to a site',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string' },
            name: { type: 'string' },
            type: { 
              type: 'string',
              enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']
            },
            ttl: { type: 'number' },
            values: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['siteId', 'name', 'type', 'values']
        }
      },
      {
        name: 'update-domain-settings',
        description: 'Update domain settings including CDN and security configurations',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            settings: {
              type: 'object',
              properties: {
                cdn_settings: {
                  type: 'object',
                  properties: {
                    enable_cache: { type: 'boolean' },
                    cache_ttl: { type: 'number' },
                    query_string_handling: { 
                      type: 'string',
                      enum: ['ignore', 'include', 'exclude']
                    }
                  }
                },
                security_settings: {
                  type: 'object',
                  properties: {
                    enable_waf: { type: 'boolean' },
                    block_bad_bots: { type: 'boolean' },
                    enable_rate_limiting: { type: 'boolean' }
                  }
                }
              }
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'update-dispatch-strategy',
        description: 'Update the CDN dispatch strategy',
        inputSchema: {
          type: 'object',
          properties: {
            strategyType: { 
              type: 'string',
              enum: ['geo', 'performance', 'cost', 'availability', 'hybrid']
            },
            settings: {
              type: 'object',
              properties: {
                weights: {
                  type: 'object',
                  properties: {
                    performance: { type: 'number', minimum: 0, maximum: 100 },
                    cost: { type: 'number', minimum: 0, maximum: 100 },
                    reliability: { type: 'number', minimum: 0, maximum: 100 }
                  }
                },
                geo_rules: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      region: { type: 'string' },
                      preferred_cdn: { type: 'string' }
                    },
                    required: ['region', 'preferred_cdn']
                  }
                },
                fallback_cdn: { type: 'string' }
              }
            }
          },
          required: ['strategyType']
        }
      },
      {
        name: 'get-performance-data',
        description: 'Get performance data for CDNs',
        inputSchema: {
          type: 'object',
          properties: {
            timeRange: { 
              type: 'string',
              enum: ['1h', '6h', '24h', '7d', '30d']
            },
            cdn: { type: 'string' },
            region: { type: 'string' }
          }
        }
      },
      {
        name: 'get-cost-data',
        description: 'Get cost data for CDNs',
        inputSchema: {
          type: 'object',
          properties: {
            timeRange: { 
              type: 'string',
              enum: ['1h', '6h', '24h', '7d', '30d']
            },
            cdn: { type: 'string' }
          }
        }
      },
      {
        name: 'optimize-strategy',
        description: 'Automatically optimize the CDN dispatch strategy based on performance and cost data',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list-cdn-providers',
        description: 'List all available CDN providers',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list-sites',
        description: 'List all CDN sites',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Mock API client for Mlytics API
const mlyticsApiClient = {
  baseUrl: 'https://api.mlytics.com/v2',
  apiKey: process.env.MLYTICS_API_KEY || 'mock-api-key',
  
  async createZone(domain, name, description) {
    // In a real implementation, this would make an actual API call
    // For now, we'll just return a mock response
    console.error(`[MOCK] Creating zone for domain: ${domain}`);
    
    return {
      id: crypto.randomUUID(),
      domain,
      name: name || domain,
      description: description || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active'
    };
  },
  
  async addRRSet(siteId, name, type, ttl, values) {
    console.error(`[MOCK] Adding DNS record for site ${siteId}: ${name} ${type}`);
    
    return {
      id: crypto.randomUUID(),
      site_id: siteId,
      name,
      type,
      ttl: ttl || 3600,
      values,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  },
  
  async updateDomain(domain, settings) {
    console.error(`[MOCK] Updating domain settings for: ${domain}`);
    
    return {
      domain,
      updated_at: new Date().toISOString(),
      settings
    };
  }
};

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request, c) => {
  const { name, arguments: args } = request.params;
  
  await ensureDataDirExists();
  
  try {
    if (name === 'create-cdn-site') {
      const { domain, name: siteName, description, cdnProviders } = CreateSiteSchema.parse(args);
      
      // Mock response based on Mlytics API documentation
      const response = await mlyticsApiClient.createZone(domain, siteName, description);
      
      // Save site data
      const sites = await loadDataOrDefault(sitesFile, []);
      const newSite = {
        ...response,
        cdn_providers: cdnProviders || ['cloudflare']
      };
      
      sites.push(newSite);
      await saveData(sitesFile, sites);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: newSite,
        message: 'Site created successfully'
      }));
    }
    else if (name === 'add-dns-record') {
      const { siteId, name: recordName, type, ttl, values } = AddDnsRecordSchema.parse(args);
      
      // Check if site exists
      const sites = await loadDataOrDefault(sitesFile, []);
      const site = sites.find(s => s.id === siteId);
      
      if (!site) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Site with ID ${siteId} not found`
        }));
      }
      
      // Mock response based on Mlytics API documentation
      const response = await mlyticsApiClient.addRRSet(siteId, recordName, type, ttl, values);
      
      // Save DNS record data
      const dnsRecords = await loadDataOrDefault(dnsRecordsFile, []);
      dnsRecords.push(response);
      await saveData(dnsRecordsFile, dnsRecords);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: response,
        message: 'DNS record added successfully'
      }));
    }
    else if (name === 'update-domain-settings') {
      const { domain, settings } = UpdateDomainSchema.parse(args);
      
      // Check if domain exists
      const sites = await loadDataOrDefault(sitesFile, []);
      const site = sites.find(s => s.domain === domain);
      
      if (!site) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Site with domain ${domain} not found`
        }));
      }
      
      // Mock response based on Mlytics API documentation
      const response = await mlyticsApiClient.updateDomain(domain, settings);
      
      // Update site settings
      site.settings = settings;
      site.updated_at = response.updated_at;
      await saveData(sitesFile, sites);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: {
          id: site.id,
          domain,
          name: site.name,
          updated_at: response.updated_at,
          settings
        },
        message: 'Domain settings updated successfully'
      }));
    }
    else if (name === 'update-dispatch-strategy') {
      const { strategyType, settings } = UpdateStrategySchema.parse(args);
      
      // Load current strategy
      const currentStrategy = await loadDataOrDefault(strategyFile, {
        strategyType: 'hybrid',
        settings: {
          weights: {
            performance: 50,
            cost: 30,
            reliability: 20
          },
          fallback_cdn: 'cloudflare'
        }
      });
      
      // Update strategy
      const newStrategy = {
        strategyType,
        settings: {
          ...currentStrategy.settings,
          ...settings
        }
      };
      
      // Save updated strategy
      await saveData(strategyFile, newStrategy);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: newStrategy,
        message: 'Dispatch strategy updated successfully'
      }));
    }
    else if (name === 'get-performance-data') {
      const { timeRange, cdn, region } = GetPerformanceDataSchema.parse(args || {});
      
      // Generate mock performance data
      const performanceData = generateMockPerformanceData(timeRange, cdn, region);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: performanceData,
        message: 'Performance data retrieved successfully'
      }));
    }
    else if (name === 'get-cost-data') {
      const { timeRange, cdn } = args || {};
      
      // Generate mock cost data
      const costData = generateMockCostData(timeRange, cdn);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: costData,
        message: 'Cost data retrieved successfully'
      }));
    }
    else if (name === 'optimize-strategy') {
      const optimizedStrategy = await calculateOptimalStrategy();
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: optimizedStrategy,
        message: 'Strategy optimized successfully based on performance and cost data'
      }));
    }
    else if (name === 'list-cdn-providers') {
      return createTextResponse(JSON.stringify({
        success: true,
        data: CDN_PROVIDERS,
        message: 'CDN providers retrieved successfully'
      }));
    }
    else if (name === 'list-sites') {
      const sites = await loadDataOrDefault(sitesFile, []);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: sites,
        message: 'Sites retrieved successfully'
      }));
    }
    else {
      return createTextResponse(JSON.stringify({
        success: false,
        message: `Unknown tool: ${name}`
      }));
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createTextResponse(JSON.stringify({
        success: false,
        message: `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      }));
    }
    
    console.error(`Error handling tool ${name}:`, error);
    
    return createTextResponse(JSON.stringify({
      success: false,
      message: `Error executing tool ${name}: ${error.message}`
    }));
  }
});

// Helper for creating text responses
const createTextResponse = (text) => {
  return {
    content: [{ type: 'text', text }]
  };
};

// Handle messages
const handle_msg = async (msg) => {
  try {
    console.error(`Received message: ${JSON.stringify(msg)}`);
    return await server.handleRequest(msg);
  } catch (error) {
    console.error(`Error handling message: ${error.message}`);
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32603,
        message: `Internal error: ${error.message}`
      }
    };
  }
};

// Start the server
const transport = new StdioServerTransport();

// Ensure all messages are properly formatted as JSON-RPC
transport.onMessage = async (msg) => {
  try {
    // Log the received message to stderr (not stdout)
    console.error(`Received message: ${JSON.stringify(msg)}`);
    
    // Process the message and get the response
    const response = await server.handleRequest(msg);
    
    // Log the response to stderr (not stdout)
    console.error(`Sending response: ${JSON.stringify(response)}`);
    
    return response;
  } catch (error) {
    console.error(`Error processing message: ${error.message}`);
    
    // Return a properly formatted JSON-RPC error response
    return {
      jsonrpc: '2.0',
      id: msg.id || null,
      error: {
        code: -32603,
        message: `Internal error: ${error.message}`
      }
    };
  }
};

await server.connect(transport);
console.error('Mlytics CDN MCP Server running on stdio');