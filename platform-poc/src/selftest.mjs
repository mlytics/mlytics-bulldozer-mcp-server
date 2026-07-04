// End-to-end proof: link a real MCP Client <-> Server in memory, run tools/list,
// then a dry-run tools/call. No network / no key needed — proves the generated
// tools register and dispatch through the SDK exactly as a real agent would see.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./server.mjs";

const { server } = buildServer({
  toolsPath: new URL("../out/tools.generated.json", import.meta.url).pathname,
  client: null,
  dryRun: true,
});

const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "selftest", version: "0" }, { capabilities: {} });
await Promise.all([server.connect(serverTx), client.connect(clientTx)]);

const { tools } = await client.listTools();
console.log(`tools/list -> ${tools.length} tools registered via MCP SDK`);
console.log("first 8:", tools.slice(0, 8).map((t) => t.name).join(", "));

// dry-run a write tool so we see the planned upstream request + auth/scope.
const target = "create-site-cache";
const call = await client.callTool({
  name: target,
  arguments: { site_domain: "example.com", body: { cache_rule: "all", ttl: 3600 } },
});
console.log(`\ntools/call ${target} (dry-run) ->`);
console.log(call.content[0].text);

await client.close();
console.log("\nOK: generated tools registered + dispatched through the real MCP SDK.");
