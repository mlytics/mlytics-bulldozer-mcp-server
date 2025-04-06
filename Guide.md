# Mlytics MCP Server Guide

## Introduction

This guide explains how to use the Mlytics MCP (Model Context Protocol) Server, which provides a set of tools for managing Mlytics CDN sites and DNS records through the Mlytics API.

## Important Prerequisite

> **DISCLAIMER:** Before you can use any of the MCP commands, you must first create a Mlytics Enterprise account and obtain an API key. 
> 
> There are two ways to authenticate with the Mlytics API:
>
> **Option 1: Using the automated-login tool (Recommended)**
> 1. Sign up for a Mlytics Enterprise account at [https://portal.mlytics.com/](https://portal.mlytics.com/)
> 2. Use the `automated-login` tool with your email and password:
>    ```json
>    {
>      "email": "your-email@example.com",
>      "password": "your-password"
>    }
>    ```
> 3. The tool will log in to the portal using a headless browser, extract the JWT token, and store it securely for subsequent API calls.
>
> **Option 2: Manual API key (Legacy method)**
> 1. Sign up for a Mlytics Enterprise account at [https://portal.mlytics.com/](https://portal.mlytics.com/)
> 2. Navigate to "User Profile" → "API" in the Mlytics portal
> 3. Click "Generate new" to create a new API key
> 4. Click "Copy" to copy the API key
> 5. Save this API key in the `cred` file as described in the setup instructions

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

### 0. Automated Login

Logs in to the Mlytics Portal using a headless browser and extracts the JWT token.

**Tool Name:** `automated-login`

**Parameters:**
- `email` (required): The email address for your Mlytics account
- `password` (required): The password for your Mlytics account
- `headless` (optional): Whether to run the browser in headless mode (default: true)

**Example:**

```json
{
  "email": "your-email@example.com",
  "password": "your-password",
  "headless": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "email": "your-email@example.com",
    "loggedInAt": "2025-04-01T10:30:00.000Z",
    "tokenStored": true,
    "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  },
  "message": "Successfully logged in and stored JWT token"
}
```

### 0.1. Show Credit Information

Displays credit usage information for the authenticated user.

**Tool Name:** `show-credit-info`

**Parameters:** None (uses the stored JWT token from automated login)

**Example:**

```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "unbilled": 16994.81,
    "used": 16994.81,
    "limit": 50000,
    "freeCredit": 0,
    "freeCreditExpiredTime": null,
    "freeCreditExpired": 0,
    "usagePercentage": 33.99,
    "remainingCredit": 33005.19,
    "remainingPercentage": 66.01
  },
  "meta": {
    "code": 29200,
    "status": "success",
    "message": ""
  },
  "message": "Credit information retrieved successfully"
}
```

> **Note:** This tool requires prior login using the `automated-login` tool.

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

### 8. Query CDN Edge Report

Retrieves CDN edge performance reports for a specific domain.

**Tool Name:** `query-cdn-edge-report`

**Parameters:**
- `domain` (required): The domain name to query reports for
- `start_time` (required): Start timestamp in Unix epoch seconds
- `end_time` (required): End timestamp in Unix epoch seconds
- `interval` (optional): Report record granularity in seconds (default varies by time range)
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Example:**

```json
{
  "domain": "example.com",
  "start_time": 1743570000,
  "end_time": 1743572614,
  "interval": 3600
}
```

**Response Data:**

The response includes performance metrics for each CDN platform, such as:
- Total requests
- Hit/miss requests
- Traffic volume
- Cache hit ratio

This data helps you analyze CDN performance and make informed decisions about your multi-CDN strategy.

### 9. Get Historical Usage Reports

Retrieves historical usage data across specified time periods, allowing you to analyze trends and patterns in DNS queries, CDN requests, and CDN traffic usage. This tool provides comprehensive analytics for monitoring your Mlytics platform usage over time.

**Tool Name:** `get-historical-reports`

**Parameters:**
- `org_id` (required): Organization ID for which data is being requested
- `usage_type` (required): Type of usage data to retrieve. Supported values:
  - `dns_query_usage_sum`: Total DNS query usage
  - `cdn_request_sum`: Total CDN requests 
  - `cdn_traffic_sum`: Total CDN traffic
- `start_time` (required): UNIX timestamp (seconds) for the start of the requested time period
- `end_time` (required): UNIX timestamp (seconds) for the end of the requested time period
- `convert_milli_timestamp` (optional): When `true`, timestamps in response will be in milliseconds. Default: `false`
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Examples:**

```json
# Example 1: DNS Query Usage
{
  "org_id": "1001642588942",
  "usage_type": "dns_query_usage_sum",
  "start_time": 1743264000,
  "end_time": 1743955199,
  "convert_milli_timestamp": true
}
```

```json
# Example 2: CDN Request Sum
{
  "org_id": "1001642588942",
  "usage_type": "cdn_request_sum",
  "start_time": 1743264000,
  "end_time": 1743955199,
  "convert_milli_timestamp": true
}
```

```json
# Example 3: CDN Traffic Sum
{
  "org_id": "1001642588942",
  "usage_type": "cdn_traffic_sum",
  "start_time": 1743264000,
  "end_time": 1743955199,
  "convert_milli_timestamp": false
}
```

**Response Data:**

The response includes:
- Time series data showing usage metrics over the specified period based on the requested usage_type
- Comparison metrics between the requested period and a previous comparable period
- Labels (timestamps) and corresponding dataset values
- Performance analytics including percentage change and absolute value change

This data is useful for:
- Monitoring usage trends over time for DNS queries, CDN requests, and CDN traffic
- Identifying usage patterns (e.g., weekday vs. weekend differences)
- Planning capacity based on historical data
- Analyzing growth or decline in usage
- Making data-driven decisions about your CDN strategy

**Example Response:**
```json
{
  "success": true,
  "data": {
    "query": {
      "compare_start_time": 1742572800000,
      "start_time": 1743264000000,
      "usage_type": ["dns_query_usage_sum"],
      "end_time": 1743955199000,
      "compare_end_time": 1743263999000
    },
    "diagrams": {
      "dns_query_usage_sum": {
        "labels": [1743264000000, 1743350400000, 1743436800000, ...],
        "datasets": [2350, 3120, 2980, ...],
        "compare_result": {
          "comparable": true,
          "reason": null,
          "result": {
            "compare_percentage": 12.5,
            "compare_value": 24500
          }
        }
      }
    }
  },
  "meta": {
    "status": "success",
    "message": null,
    "code": 200
  },
  "message": "Historical usage data retrieved successfully for dns_query_usage_sum"
}
```

### 10. Query Guide Documentation

Retrieves information from the Guide.md documentation, allowing you to search for keywords, retrieve specific sections, or get a table of contents, with support for multiple output formats.

**Tool Name:** `query-guide`

**Parameters:**
- `keyword` (optional): Keyword to search for in the guide
- `section` (optional): Specific section to retrieve from the guide
- `format` (optional): Output format - can be 'text', 'markdown', 'html', or 'json' (default: 'text')

**Examples:**

```json
# Example 1: Get table of contents
{
  "format": "markdown"
}
```

```json
# Example 2: Search for a keyword
{
  "keyword": "authentication",
  "format": "text"
}
```

```json
# Example 3: Get a specific section
{
  "section": "Authentication Methods",
  "format": "html"
}
```

**Response Data:**

The response varies based on the operation:

1. Table of Contents (when neither keyword nor section are provided):
   - List of all sections and their hierarchy levels
   - Formatted content based on the requested format

2. Keyword Search:
   - Matching sections containing the keyword
   - Line numbers and context for each match
   - Match counts and formatted content

3. Section Retrieval:
   - The content of the requested section
   - Formatted according to the requested format

**Example Response (Section Request with JSON format):**
```json
{
  "success": true,
  "data": {
    "section": "Authentication Methods",
    "title": "Authentication Methods",
    "content": "## Authentication Methods\n\nThe MCP server supports two authentication methods:\n\n1. **JWT Token via Automated Login (Recommended)**...",
    "parts": [
      "## Authentication Methods",
      "The MCP server supports two authentication methods:",
      "1. **JWT Token via Automated Login (Recommended)**...",
      "..."
    ]
  },
  "message": "Retrieved section 'Authentication Methods' in JSON format"
}
```

### 11. Capacity Planning Forecast

Generates capacity planning forecasts with historical analysis, growth projections, and actionable recommendations.

**Tool Name:** `capacity-forecast`

**Parameters:**
- `org_id` (required): Organization ID for which data is being requested
- `usage_type` (required): Type of usage data to forecast - one of:
  - `dns_query_usage_sum`: DNS query usage data
  - `cdn_request_sum`: CDN request count data
  - `cdn_traffic_sum`: CDN traffic volume data
- `historical_days` (optional): Number of days of historical data to analyze (default: 90)
- `forecast_days` (optional): Number of days to forecast into the future (default: 90)
- `growth_rate` (optional): Monthly growth rate assumption as decimal (default: 0.05 for 5%)
- `include_seasonality` (optional): Whether to include seasonal patterns in forecast (default: true)
- `confidence_interval` (optional): Confidence interval for forecast (0-0.99, default: 0.95 for 95%)
- `threshold_warning` (optional): Capacity threshold for warnings as decimal (default: 0.7 for 70%)
- `threshold_critical` (optional): Capacity threshold for critical alerts as decimal (default: 0.9 for 90%)
- `apiKey` (optional): Mlytics API key to use instead of the one in the credentials file

**Examples:**

```json
# Example 1: Basic forecast with defaults
{
  "org_id": "1001642588942",
  "usage_type": "dns_query_usage_sum"
}
```

```json
# Example 2: Advanced forecast with custom parameters
{
  "org_id": "1001642588942",
  "usage_type": "cdn_traffic_sum",
  "historical_days": 60,
  "forecast_days": 180,
  "growth_rate": 0.08,
  "include_seasonality": true,
  "confidence_interval": 0.9,
  "threshold_warning": 0.6,
  "threshold_critical": 0.85
}
```

**Response Data:**

The response includes comprehensive forecast data:

1. **Timeline Data**:
   - Historical usage data with timestamps
   - Projected usage values
   - Confidence interval upper and lower bounds
   - Warning and critical threshold values
   - Historical end index marker

2. **Capacity Analysis**:
   - Current capacity and usage percentage
   - Warning and critical breach dates (if any)
   - Recommended capacity increase:
     - Increase amount
     - Increase percentage
     - Recommended new capacity

3. **Growth Metrics**:
   - Current usage value
   - Past 30-day average
   - Projected 30-day and 90-day averages
   - Growth percentages
   - Peak usage projections

4. **Actionable Recommendations**:
   - Capacity planning recommendations
   - Growth trend insights
   - Usage-specific optimization suggestions

**Example Response:**
```json
{
  "success": true,
  "data": {
    "query": {
      "org_id": "1001642588942",
      "usage_type": "dns_query_usage_sum",
      "historical_days": 90,
      "forecast_days": 90,
      "generated_at": "2025-04-07T10:30:00.000Z"
    },
    "forecast": {
      "timeline": {
        "labels": ["2025-01-07T00:00:00.000Z", "2025-01-08T00:00:00.000Z", ...],
        "values": [125430, 138920, ...],
        "confidence_lower": [null, null, ..., 145200, 148300, ...],
        "confidence_upper": [null, null, ..., 170400, 175600, ...],
        "threshold_warning": [350000, 350000, ...],
        "threshold_critical": [450000, 450000, ...],
        "historical_end_index": 89
      },
      "capacity": {
        "current": 500000,
        "current_usage_percent": "28.40",
        "warning_breach_date": "2025-06-15T00:00:00.000Z",
        "critical_breach_date": null,
        "recommended_increase": {
          "increase_amount": 100000,
          "increase_percent": "20.0",
          "new_capacity": 600000
        }
      },
      "growth_metrics": {
        "current_value": 142000,
        "past_30_days_avg": 128750,
        "next_30_days_avg": 156800,
        "next_90_days_avg": 196500,
        "next_30_days_growth_pct": "21.78",
        "next_90_days_growth_pct": "52.62",
        "next_30_days_peak": 182400,
        "next_90_days_peak": 375600
      },
      "recommendations": [
        {
          "type": "warning",
          "title": "Capacity Warning Threshold Approaching",
          "message": "Your dns_query_usage_sum is projected to reach warning capacity threshold on Sat Jun 15 2025. Begin capacity planning soon."
        },
        {
          "type": "warning",
          "title": "Rapid Growth Detected",
          "message": "You're experiencing rapid growth (21.8% in next 30 days). Consider adding CDN capacity soon."
        },
        {
          "type": "optimization",
          "title": "DNS Query Optimization",
          "message": "Consider increasing DNS TTL values to reduce query frequency, or implementing DNS caching at edge locations."
        }
      ]
    }
  },
  "message": "Capacity forecast generated successfully for dns_query_usage_sum"
}
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

## Authentication Workflow

Before performing any operations, you need to authenticate:

1. **Login with the automated-login tool**:
   ```json
   {
     "email": "your-email@example.com", 
     "password": "your-password"
   }
   ```

2. **Check credit information** (optional):
   ```json
   {}
   ```
   This shows your current credit usage and limits.

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