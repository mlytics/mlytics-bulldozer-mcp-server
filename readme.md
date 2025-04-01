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

- `create-cdn-site`: Create a new CDN site
- `check-site-status`: Check the status of a domain
- `list-dns-records`: List all DNS records for a site
- `add-dns-record`: Add a new DNS record to a site
- `update-domain-settings`: Update settings for a domain
- `list-cdn-providers`: List all available CDN providers
- `list-sites`: List all CDN sites

For detailed information about each tool and how to use them, please refer to the [Guide.md](Guide.md) file.

## API Key Management

The MCP server can use API keys in two ways:

1. From the credentials file: By default, the server reads the API key from the `cred` file in the project directory.

2. Provided directly to tools: You can provide an API key directly when calling a tool by including the `apiKey` parameter.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Additional Resources

- [Mlytics API Documentation](https://developer.mlytics.com/v2.0/docs/getting-started)
- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/spec)
