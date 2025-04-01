// Mlytics CDN MCP Server - Clean Implementation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as crypto from 'crypto';
import fetch from 'node-fetch';

// Data storage paths
const dataDir = path.join(os.homedir(), '.mlytics-mcp-server');
const sitesFile = path.join(dataDir, 'sites.json');
const dnsRecordsFile = path.join(dataDir, 'dns_records.json');
const strategyFile = path.join(dataDir, 'strategy.json');

// Ensure data directory exists
const ensureDataDirExists = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    // Silently handle error
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

// Schema definitions for tool requests
const CreateSiteSchema = z.object({
  domain: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  cdnProviders: z.array(z.string()).optional(),
  apiKey: z.string().optional(),
});

const AddDnsRecordSchema = z.object({
  siteId: z.string(),
  name: z.string(),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
  ttl: z.number().optional(),
  values: z.array(z.string()),
  proxied: z.boolean().optional(),
  apiKey: z.string().optional(),
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
  apiKey: z.string().optional(),
});

const CheckSiteStatusSchema = z.object({
  domain: z.string(),
  apiKey: z.string().optional(),
});

const ListDnsRecordsSchema = z.object({
  siteId: z.string(),
  apiKey: z.string().optional(),
});

// Initialize MCP Server
const server = new Server(
  {
    name: 'mlytics-cdn-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {}
    }
  }
);

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
            },
            apiKey: { type: 'string' }
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
            },
            proxied: { type: 'boolean' },
            apiKey: { type: 'string' }
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
            },
            apiKey: { type: 'string' }
          },
          required: ['domain']
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
      },
      {
        name: 'check-site-status',
        description: 'Check the status of a specific domain in Mlytics CDN',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            apiKey: { type: 'string' }
          },
          required: ['domain']
        }
      },
      {
        name: 'list-dns-records',
        description: 'List all DNS records for a specific site',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string' },
            apiKey: { type: 'string' }
          },
          required: ['siteId']
        }
      }
    ]
  };
});

// Handle prompts/list method
server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
  // Return an empty list of prompts or your actual prompts if you have any
  return {
    prompts: [],
    pagination: {
      hasMore: false
    }
  };
});

// Helper for creating text responses
const createTextResponse = (text) => {
  return {
    content: [{ type: 'text', text }]
  };
};

// Helper to read API key from credentials file or use provided key
const getApiKey = async (providedKey) => {
  // If a key is provided, use it
  if (providedKey) {
    console.log('Using provided API key');
    return providedKey;
  }
  
  try {
    // Use absolute path instead of relative path
    const credPath = path.join(process.cwd(), 'cred');
    console.log(`Reading API key from: ${credPath}`);
    const apiKeyContent = await fs.readFile(credPath, 'utf-8');
    const apiKey = apiKeyContent.split('\n').filter(line => !line.startsWith('//'))[0].trim();
    if (!apiKey) {
      throw new Error('API key not found in credentials file');
    }
    console.log('API key successfully read');
    return apiKey;
  } catch (error) {
    console.error(`Error reading API key: ${error.message}`);
    throw new Error(`Failed to read API key from credentials file: ${error.message}`);
  }
};

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  await ensureDataDirExists();
  
  try {
    if (name === 'create-cdn-site') {
      const { domain, name: siteName, description, cdnProviders, apiKey: providedApiKey } = CreateSiteSchema.parse(args);
      
      // Read API key from credentials file or use provided key
      let apiKey;
      try {
        apiKey = await getApiKey(providedApiKey);
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: error.message
        }));
      }
      
      // Call the real Mlytics API
      try {
        const response = await fetch('https://openapi2.mlytics.com/api/v2/mdns/zone/', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            domain_name: domain
          })
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Save site data locally as well
          const newSite = {
            id: responseData.data.id,
            domain,
            name: siteName || domain,
            description: description || '',
            created_at: responseData.data.created_at,
            updated_at: responseData.data.created_at,
            cdn_providers: cdnProviders || ['mlytics'],
            status: 'active',
            api_response: responseData
          };
          
          const sites = await loadDataOrDefault(sitesFile, []);
          sites.push(newSite);
          await saveData(sitesFile, sites);
          
          return createTextResponse(JSON.stringify({
            success: true,
            data: newSite,
            message: 'Site created successfully via Mlytics API'
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`,
        }));
      }
    }
    else if (name === 'add-dns-record') {
      const { siteId, name: recordName, type, ttl, values, proxied, apiKey: providedApiKey } = AddDnsRecordSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Prepare the request payload
        const detail = values.map(value => ({ value }));
        
        const payload = {
          type,
          name: recordName,
          ttl: ttl || 3600,
          proxied: proxied !== undefined ? proxied : false,
          detail
        };
        
        // Call the Mlytics API to create a DNS record
        const response = await fetch(`https://openapi2.mlytics.com/api/v2/mdns/zone/${siteId}/rrset/`, {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Save DNS record data locally as well
          const newRecord = {
            id: responseData.data.rrsets[0].id,
            site_id: siteId,
            name: recordName,
            type,
            ttl: ttl || 3600,
            proxied: proxied !== undefined ? proxied : false,
            values,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            api_response: responseData
          };
          
          const dnsRecords = await loadDataOrDefault(dnsRecordsFile, []);
          dnsRecords.push(newRecord);
          await saveData(dnsRecordsFile, dnsRecords);
          
          return createTextResponse(JSON.stringify({
            success: true,
            data: newRecord,
            message: 'DNS record added successfully via Mlytics API'
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
    }
    else if (name === 'update-domain-settings') {
      const { domain, settings, apiKey: providedApiKey } = UpdateDomainSchema.parse(args);
      
      // Check if domain exists
      const sites = await loadDataOrDefault(sitesFile, []);
      const site = sites.find(s => s.domain === domain);
      
      if (!site) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Site with domain ${domain} not found`
        }));
      }
      
      // Update site settings
      site.settings = settings;
      site.updated_at = new Date().toISOString();
      await saveData(sitesFile, sites);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: {
          id: site.id,
          domain,
          name: site.name,
          updated_at: site.updated_at,
          settings
        },
        message: 'Domain settings updated successfully'
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
    else if (name === 'check-site-status') {
      const { domain, apiKey: providedApiKey } = CheckSiteStatusSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Call the Mlytics API to list all sites
        const response = await fetch('https://openapi2.mlytics.com/api/v2/mdns/zone/all/', {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey
          }
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Find the site with the specified domain
          const site = responseData.data.find(site => site.domain_name === domain);
          
          if (site) {
            // Map zone_status to a human-readable status
            const statusMap = {
              0: 'Pending',
              1: 'Active',
              2: 'Error',
              3: 'Suspended'
            };
            
            const readableStatus = statusMap[site.zone_status] || 'Unknown';
            
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                id: site.id,
                domain: site.domain_name,
                status: readableStatus,
                zone_status: site.zone_status,
                raw: site
              },
              message: `Site '${domain}' found with status: ${readableStatus}`
            }));
          } else {
            return createTextResponse(JSON.stringify({
              success: false,
              message: `Site '${domain}' not found in Mlytics CDN`,
              data: {
                available_sites: responseData.data.map(site => site.domain_name)
              }
            }));
          }
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
    }
    else if (name === 'list-dns-records') {
      const { siteId, apiKey: providedApiKey } = ListDnsRecordsSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Call the Mlytics API to list all DNS records for the site
        const response = await fetch(`https://openapi2.mlytics.com/api/v2/mdns/zone/${siteId}/rrset/`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey
          }
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          return createTextResponse(JSON.stringify({
            success: true,
            data: responseData.data,
            meta: responseData.meta,
            message: `DNS records for site ${siteId} retrieved successfully`
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
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
    
    return createTextResponse(JSON.stringify({
      success: false,
      message: `Error executing tool ${name}: ${error.message}`
    }));
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
