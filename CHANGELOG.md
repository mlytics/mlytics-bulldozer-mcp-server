# Changelog

All notable changes to the Mlytics MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Capacity planning forecast tool with historical analysis, projections, and recommendations
  - Support for different usage types (DNS queries, CDN requests, CDN traffic)
  - Pattern recognition for weekday/weekend and seasonal variations
  - Growth trend analysis and breach detection
  - Confidence intervals for forecasts
  - Actionable capacity recommendations
  - Test script for capacity forecasting

## [1.1.0] - 2025-04-06

### Added
- `get-historical-reports` tool for retrieving historical usage data
  - Support for DNS query usage, CDN request, and CDN traffic data types
  - Time-period comparison and trend analysis
  - Optional millisecond timestamp conversion
  - Support for both JWT and API key authentication

- `query-guide` documentation search tool
  - Multiple output formats (text, markdown, HTML, JSON)
  - Section-based navigation
  - Keyword search with context
  - Table of contents generation
  - Fallback to mock content when guide isn't available

### Fixed
- ES Module compatibility issues
- Path resolution for file access
- Authentication error handling and fallbacks

## [1.0.0] - 2025-04-01

### Added
- Initial implementation of Mlytics MCP server
- Core authentication tools:
  - `automated-login`: Playwright-based login automation
  - Support for storing and retrieving JWT tokens
  - API key-based authentication

- CDN management tools:
  - `create-cdn-site`: Create a new CDN site with specified domain
  - `add-dns-record`: Add DNS records to a site
  - `update-domain-settings`: Update domain configuration
  - `list-cdn-providers`: List available CDN providers
  - `list-sites`: List all CDN sites
  - `list-dns-records`: List all DNS records for a site

- Performance measurement tools:
  - `query-cdn-edge-report`: Query CDN edge performance reports
  - `check-site-status`: Check domain status in Mlytics CDN
  - `show-credit-info`: Display current credit usage information

### Security
- Input validation using Zod schema
- Secure token storage in user's home directory
- Protected JWT token handling

[Unreleased]: https://github.com/mlytics/mlytics-cdn-mcp/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mlytics/mlytics-cdn-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mlytics/mlytics-cdn-mcp/releases/tag/v1.0.0