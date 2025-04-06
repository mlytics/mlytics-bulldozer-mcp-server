# Mlytics CDN MCP Server

A Model Context Protocol (MCP) server implementation for managing Mlytics CDN sites and DNS records.

## Overview

This MCP server provides a set of tools for interacting with the Mlytics API, allowing you to:

- Create and manage CDN sites
- Check site status
- Add and list DNS records
- Update domain settings
- List available CDN providers

The server implements the Model Context Protocol, making it compatible with MCP clients and AI assistants that support the protocol.

## Installation

### Prerequisites

- Node.js 18.0 or higher
- npm or yarn package manager

### Setup

1. Clone the repository:

```bash
git clone https://github.com/mlytics/mlytics-bulldozer-mcp-server.git
cd mlytics-bulldozer-mcp-server
```

2. Install dependencies:

```bash
npm install
```

3. Create a credentials file:

Create a file named `cred` in the project root directory and add your Mlytics API key:

```
//mlytics apikey
your-api-key-here
```

## Usage

Start the MCP server:

```bash
node mcp-server.js
```

The server will start and listen for MCP requests on stdin/stdout.

## Available Tools

The MCP server provides the following tools:

- `automated-login`: Log in to Mlytics Portal using headless browser and extract JWT token
- `show-credit-info`: Display current credit usage information for the authenticated user
- `create-cdn-site`: Create a new CDN site
- `check-site-status`: Check the status of a domain
- `list-dns-records`: List all DNS records for a site
- `add-dns-record`: Add a new DNS record to a site
- `update-domain-settings`: Update settings for a domain
- `list-cdn-providers`: List all available CDN providers
- `list-sites`: List all CDN sites
- `query-cdn-edge-report`: Query CDN edge performance reports for a domain
- `get-historical-reports`: Retrieve historical usage data for DNS queries across specified time periods
- `query-guide`: Query information from the Guide.md documentation with customizable output format
- `capacity-forecast`: Generate capacity planning forecasts with historical analysis, projections, and recommendations

For detailed information about each tool and how to use them, please refer to the [Guide.md](Guide.md) file.

## Authentication Methods

The MCP server supports two authentication methods:

1. **JWT Token via Automated Login (Recommended)**: Use the `automated-login` tool to log in to the Mlytics Portal via a headless browser. This extracts and stores a JWT token that will be used for subsequent API calls.

   ```json
   {
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```

   After successful login, tools like `show-credit-info` will automatically use the stored JWT token.

2. **API Key (Legacy)**: 
   - From the credentials file: By default, the server reads the API key from the `cred` file in the project directory.
   - Provided directly to tools: You can provide an API key directly when calling a tool by including the `apiKey` parameter.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Additional Resources

- [Mlytics API Documentation](https://developer.mlytics.com/v2.0/docs/getting-started)
- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/spec)

## Output Format Options in Claude

When using Claude with the MCP server, you can specify different output formats for certain tools (like the `query-guide` tool). Similarly, Claude itself supports different rendering options when used through various interfaces:

### Formatting Options in Claude CLI

When using the Claude CLI, you can control the appearance of Claude's responses:

1. **Default Terminal Output**: 
   Standard text output with basic formatting.

2. **Markdown Rendering**: 
   Most Claude CLI implementations render markdown, allowing for:
   - Headers (# for h1, ## for h2, etc.)
   - Lists (bulleted and numbered)
   - Code blocks with syntax highlighting
   - Tables
   - Bold and italic text

3. **Plain Text**: 
   Using the `--no-markdown` flag to disable markdown rendering.

4. **HTML Output**: 
   Some Claude CLI implementations can output HTML that can be redirected to a file.

### Using the `query-guide` Tool

The `query-guide` tool mirrors this functionality by allowing you to specify the following formats:

- `text`: Plain text with minimal formatting
- `markdown`: Markdown-formatted content
- `html`: HTML-formatted content for web display
- `json`: Structured data in JSON format

Example:
```json
{
  "section": "Authentication Methods",
  "format": "markdown"
}
```

This flexibility allows you to get information in the most useful format for your specific use case.
