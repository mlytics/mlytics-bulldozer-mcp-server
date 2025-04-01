# Mlytics MCP Server Guide

## Introduction

This guide explains how to use the Mlytics MCP (Model Context Protocol) Server, which provides a set of tools for managing Mlytics CDN sites and DNS records through the Mlytics API.

## Visual Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  1. Create Site ├────►│ 2. Check Status ├────►│  3. Add DNS     │
│                 │     │                 │     │     Records     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐     ┌────────▼────────┐
│                 │     │                 │     │                 │
│  6. Check Final │◄────┤ 5. Update       │◄────┤ 4. List DNS     │
│     Status      │     │    Settings     │     │    Records      │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Getting Started

### Prerequisites

- Node.js installed
- Mlytics API key (stored in the `cred` file or provided directly to tools)

### Running the Server

To start the MCP server, run:

```bash
node mcp-server.js
```

The server will start and listen for MCP requests on stdin/stdout.

## Available Tools

The MCP server provides the following tools:

### 1. Create CDN Site

Creates a new site in the Mlytics CDN platform.

**Tool Name:** `create-cdn-site`

**Parameters:**
- `domain` (required): The domain name for the site
- `name` (optional): A friendly name for the site
- `description` (optional): A description of the site
- `cdnProviders` (optional): Array of CDN providers to use
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Example:**

```json
{
  "domain": "example.com",
  "name": "Example Website",
  "description": "My example website",
  "cdnProviders": ["mlytics", "cloudflare"]
}
```

### 2. Check Site Status

Checks the status of a specific domain in the Mlytics CDN platform.

**Tool Name:** `check-site-status`

**Parameters:**
- `domain` (required): The domain name to check
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Example:**

```json
{
  "domain": "example.com"
}
```

### 3. List DNS Records

Lists all DNS records for a specific site.

**Tool Name:** `list-dns-records`

**Parameters:**
- `siteId` (required): The ID of the site to list DNS records for
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Example:**

```json
{
  "siteId": "site-id-here"
}
```

### 4. Add DNS Record

Adds a new DNS record to a site.

**Tool Name:** `add-dns-record`

**Parameters:**
- `siteId` (required): The ID of the site to add the DNS record to
- `name` (required): The name of the DNS record (e.g., "www.example.com")
- `type` (required): The type of DNS record (A, AAAA, CNAME, MX, TXT, NS)
- `values` (required): Array of values for the DNS record
- `ttl` (optional): Time to live in seconds (default: 3600)
- `proxied` (optional): Whether the record should be proxied through Mlytics (default: false)
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Example:**

```json
{
  "siteId": "site-id-here",
  "name": "www.example.com",
  "type": "CNAME",
  "values": ["target.example.net"],
  "ttl": 60,
  "proxied": true
}
```

### 5. Update Domain Settings

Updates settings for a domain.

**Tool Name:** `update-domain-settings`

**Parameters:**
- `domain` (required): The domain name to update settings for
- `settings` (optional): Object containing settings to update
  - `cdn_settings` (optional): CDN-related settings
    - `enable_cache` (optional): Whether to enable caching
    - `cache_ttl` (optional): Cache TTL in seconds
    - `query_string_handling` (optional): How to handle query strings (ignore, include, exclude)
  - `security_settings` (optional): Security-related settings
    - `enable_waf` (optional): Whether to enable Web Application Firewall
    - `block_bad_bots` (optional): Whether to block bad bots
    - `enable_rate_limiting` (optional): Whether to enable rate limiting
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Example:**

```json
{
  "domain": "example.com",
  "settings": {
    "cdn_settings": {
      "enable_cache": true,
      "cache_ttl": 3600,
      "query_string_handling": "ignore"
    },
    "security_settings": {
      "enable_waf": true,
      "block_bad_bots": true
    }
  }
}
```

### 6. List CDN Providers

Lists all available CDN providers.

**Tool Name:** `list-cdn-providers`

**Parameters:** None

**Example:**

```json
{}
```

### 7. List Sites

Lists all CDN sites.

**Tool Name:** `list-sites`

**Parameters:** None

**Example:**

```json
{}
```

## Using the MCP Server with Clients

### JSON-RPC Format

The MCP server uses JSON-RPC 2.0 for communication. To call a tool, send a request in the following format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool-name",
    "arguments": {
      // Tool-specific arguments
    }
  }
}
```

### Using with MCP SDK

If you're using the MCP SDK, you can call tools like this:

```javascript
// Initialize the client
const client = new Client(transport);

// Call a tool
const result = await client.callTool('check-site-status', {
  domain: 'example.com'
});
```

## API Key Management

The MCP server can use API keys in two ways:

1. **From the credentials file**: By default, the server reads the API key from the `cred` file in the project directory.

2. **Provided directly to tools**: You can provide an API key directly when calling a tool by including the `apiKey` parameter.

Example with provided API key:

```json
{
  "domain": "example.com",
  "apiKey": "your-api-key-here"
}
```

## Error Handling

All tools return responses in a consistent format:

```json
{
  "success": true/false,
  "message": "Success or error message",
  "data": { /* Response data */ }
}
```

If an error occurs, the `success` field will be `false` and the `message` field will contain information about the error.

## Detailed Workflow

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                         Mlytics MCP Server Workflow                       │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐                      ┌───────────────────┐
│                   │                      │                   │
│   Start Process   │                      │   Create Site     │
│                   │                      │                   │
└─────────┬─────────┘                      │  create-cdn-site  │
          │                                │                   │
          │                                └─────────┬─────────┘
          │                                          │
          │                                          │
          │                                          ▼
          │                                ┌───────────────────┐
          │                                │                   │
          └───────────────────────────────►│   Check Status    │
                                           │                   │
                                           │  check-site-status│
                                           │                   │
                                           └─────────┬─────────┘
                                                     │
                                                     │
                                                     ▼
┌───────────────────┐                      ┌───────────────────┐
│                   │                      │                   │
│  Update Settings  │◄─────────────────────┤   Add DNS Record  │
│                   │                      │                   │
│update-domain-     │                      │  add-dns-record   │
│settings           │                      │                   │
└─────────┬─────────┘                      └─────────┬─────────┘
          │                                          │
          │                                          │
          ▼                                          ▼
┌───────────────────┐                      ┌───────────────────┐
│                   │                      │                   │
│  Check Final      │                      │  List DNS Records │
│  Status           │                      │                   │
│                   │                      │  list-dns-records │
│  check-site-status│                      │                   │
│                   │                      │                   │
└─────────┬─────────┘                      └───────────────────┘
          │
          │
          ▼
┌───────────────────┐
│                   │
│   Site Active     │
│                   │
└───────────────────┘
```

# Step-by-Step Guide to Setting Up a Site on Mlytics Multi-CDN Platform

This guide will walk you through the process of creating and configuring a new website with Mlytics Multi-CDN platform, allowing you to leverage multiple CDN providers (like Cloudflare and Akamai) for improved performance and reliability.

## Step 1: Create a New Site

**What you'll do:** Create a new site in the Mlytics platform.

**How to think about it:** This is like registering your business with the government before opening a store.

**Tool to use:** `create-cdn-site`

**Example:**
```json
{
  "domain": "example.com",
  "name": "My Example Site",
  "description": "A demonstration website"
}
```

**What happens:** Mlytics will create a new site configuration for your domain. You'll receive a site ID that you'll use in subsequent steps.

## Step 2: Check Site Status

**What you'll do:** Verify that your site was created successfully.

**How to think about it:** This is like checking that your business registration went through properly.

**Tool to use:** `check-site-status`

**Example:**
```json
{
  "domain": "example.com"
}
```

**What happens:** You'll see the current status of your site. Initially, it will be in a "Pending" state.

## Step 3: Add DNS Records

**What you'll do:** Create DNS records for your domain that will route traffic through Mlytics.

**How to think about it:** This is like putting up signs that direct customers to your store.

**Tool to use:** `add-dns-record`

**Example for adding a CNAME record:**
```json
{
  "siteId": "your-site-id-from-step-1",
  "name": "www.example.com",
  "type": "CNAME",
  "values": ["your-origin-server.com"],
  "ttl": 3600,
  "proxied": true
}
```

**What happens:** Mlytics will create a DNS record in their system. When you update your domain's nameservers to point to Mlytics (in your domain registrar), this record will become active.

## Step 4: List DNS Records

**What you'll do:** Verify that your DNS records were created successfully.

**How to think about it:** This is like double-checking that all your store signs are in place.

**Tool to use:** `list-dns-records`

**Example:**
```json
{
  "siteId": "your-site-id-from-step-1"
}
```

**What happens:** You'll see a list of all DNS records associated with your site.

## Step 5: Update Domain Settings

**What you'll do:** Configure CDN and security settings for your domain.

**How to think about it:** This is like setting up the security system and inventory management for your store.

**Tool to use:** `update-domain-settings`

**Example:**
```json
{
  "domain": "example.com",
  "settings": {
    "cdn_settings": {
      "enable_cache": true,
      "cache_ttl": 86400
    },
    "security_settings": {
      "enable_waf": true,
      "block_bad_bots": true
    }
  }
}
```

**What happens:** Mlytics will update the settings for your domain, which will affect how content is cached and protected.

## Step 6: Check Site Status Again

**What you'll do:** Verify that your site is now active after completing all the setup steps.

**How to think about it:** This is like verifying that your store is now open for business.

**Tool to use:** `check-site-status`

**Example:**
```json
{
  "domain": "example.com"
}
```

**What you're doing:** Checking if your site has moved from the "Pending" state to "Active" after setting up DNS records.

**How to think about it:** This is like verifying that your store is now open for business.