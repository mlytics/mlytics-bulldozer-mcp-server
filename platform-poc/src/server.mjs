// Platform MCP server (PoC) — registers the generated tools with the real MCP
// SDK and dispatches every call through the central MlyticsApiClient.
//
// One generic handler drives all N tools (no per-tool boilerplate) — this is the
// pattern that scales bulldozer's 17 hand-written tools to the full 82-endpoint
// surface (and beyond) without a 4,000-line file.

import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MlyticsApiClient } from "./apiClient.mjs";

export function buildServer({ toolsPath, client, dryRun = false }) {
  const tools = JSON.parse(readFileSync(toolsPath));
  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "mlytics-platform-mcp", version: "0.1.0-poc" },
    { capabilities: { tools: {} } }
  );

  // tools/list — strip server-only _meta before exposing to the model.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  // tools/call — one handler for every generated tool.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) return { isError: true, content: [{ type: "text", text: `unknown tool: ${req.params.name}` }] };
    const args = req.params.arguments ?? {};

    if (dryRun) {
      // Show the exact request the tool WOULD make — proves wiring without a live key.
      return { content: [{ type: "text", text: JSON.stringify({ plan: tool._meta, args }, null, 2) }] };
    }
    try {
      const result = await client.call(tool._meta, args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `${e.name}: ${e.message}` }] };
    }
  });

  return { server, tools };
}

// Default stdio entrypoint (real deployment uses this).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const client = new MlyticsApiClient({
    baseUrl: process.env.MLYTICS_BASE_URL ?? "https://openapi2.mlytics.com/api",
    apiKey: process.env.MLYTICS_API_KEY ?? "",
    organizationId: process.env.MLYTICS_ORG_ID,
    log: (e) => console.error(JSON.stringify(e)),
  });
  const { server } = buildServer({
    toolsPath: new URL("../out/tools.generated.json", import.meta.url).pathname,
    client,
    dryRun: process.env.DRY_RUN === "1",
  });
  await server.connect(new StdioServerTransport());
  console.error("mlytics-platform-mcp (PoC) listening on stdio");
}
