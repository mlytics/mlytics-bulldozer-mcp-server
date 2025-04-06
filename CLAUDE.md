# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands
- Install dependencies: `npm install`
- Build project: `npm run build`
- Start server: `npm start`
- Purge database: `npm run purge-db`

## Code Style Guidelines
- **Type**: This is an ES Module project (uses `type: "module"` in package.json)
- **Imports**: Use ES module imports (`import x from 'y'`)
- **Async/Await**: Use async/await pattern for asynchronous operations
- **Error Handling**: Use try/catch blocks for error handling
- **Logging**: Use console.error for logging (to avoid stdout contamination)
- **Data Storage**: Data is stored in JSON files in ~/.mlytics-cdn-mcp directory
- **Validation**: Use Zod for schema validation and type checking
- **API Responses**: Follow the pattern of `{success, data, message}` for API responses

## Testing
- No formal test suite is implemented
- Test manually by running the server and using MCP clients to call tools