// Smoke test: real MCP client over stdio against server.mjs.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL("./server.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const free = await client.callTool({ name: "list_products", arguments: {} });
const manifest = JSON.parse(free.content[0].text);
console.log("free tool OK: endpoints =", manifest.endpoints.length);

for (const name of ["get_fear_greed", "get_feed_status"]) {
  const r = await client.callTool({ name, arguments: {} });
  if (r.isError) throw new Error(`${name} must work without a wallet, got: ${r.content[0].text.slice(0, 120)}`);
  console.log(`free tool OK: ${name}`);
}

const paid = await client.callTool({ name: "get_regime_forecast", arguments: {} });
console.log("paid tool (no key) isError:", paid.isError, "| starts:", paid.content[0].text.slice(0, 60));

await client.close();
