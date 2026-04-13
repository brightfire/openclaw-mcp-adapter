import { parseConfig } from "./config.js";
import { McpClientPool } from "./mcp-client.js";

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(_id: string, params: unknown): Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }>;
}

// Module-level shared state — survives across plugin instances within the same
// gateway process. The primary instance (the one with full config) populates
// these via service.start(). Sub-agent fresh loads (which get empty pluginConfig)
// read from here so their factories still return the discovered tools.
const sharedToolCache = new Map<string, ToolDef[]>();
let sharedPool: McpClientPool | null = null;

export default function (api: any) {
  const config = parseConfig(api.pluginConfig);
  const hasConfig = config.servers.length > 0;
  const hasCachedServers = sharedToolCache.size > 0;

  if (!hasConfig && !hasCachedServers) {
    // No config and cache not yet populated (expected on cold start for
    // non-primary instances — they'll get tools once the primary completes
    // service.start() and subsequent sessions resolve factories).
    console.log("[openclaw-mcp-adapter] No servers configured");
    return;
  }

  // Register a factory per server. For the primary load, server names come
  // from config. For fresh loads (sub-agents with empty pluginConfig), fall
  // back to whatever the primary already cached — factories still work because
  // they close over the module-level sharedToolCache.
  const serverNames = hasConfig
    ? config.servers.map((s: any) => s.name)
    : Array.from(sharedToolCache.keys());

  for (const serverName of serverNames) {
    api.registerTool(
      (_ctx: unknown): ToolDef[] | null => {
        return sharedToolCache.get(serverName) ?? null;
      },
      { name: `${serverName}_adapter` }
    );
  }

  // Only the primary load (with full config) registers the service that
  // connects to MCP servers and populates the shared cache.
  if (!hasConfig) return;

  if (!sharedPool) sharedPool = new McpClientPool();
  const pool = sharedPool;

  api.registerService({
    id: "openclaw-mcp-adapter",

    async start() {
      for (const server of config.servers) {
        try {
          console.log(`[openclaw-mcp-adapter] Connecting to ${server.name}...`);
          await pool.connect(server);

          const tools = await pool.listTools(server.name);
          console.log(
            `[openclaw-mcp-adapter] ${server.name}: discovered ${tools.length} tools`
          );

          const defs: ToolDef[] = tools.map((tool: any) => {
            const toolName = config.toolPrefix
              ? `${server.name}__${tool.name}`
              : tool.name;

            return {
              name: toolName,
              description: tool.description ?? `Tool from ${server.name}`,
              parameters: tool.inputSchema ?? {
                type: "object",
                properties: {},
              },
              async execute(_id: string, params: unknown) {
                const result = await pool.callTool(
                  server.name,
                  tool.name,
                  params
                );
                const text =
                  result.content
                    ?.map((c: any) => c.text ?? c.data ?? "")
                    .join("\n") ?? "";
                return {
                  content: [{ type: "text", text }],
                  isError: result.isError,
                };
              },
            };
          });

          sharedToolCache.set(server.name, defs);

          for (const def of defs) {
            console.log(`[openclaw-mcp-adapter] Ready: ${def.name}`);
          }
        } catch (err) {
          console.error(
            `[openclaw-mcp-adapter] Failed to connect to ${server.name}:`,
            err
          );
        }
      }
    },

    async stop() {
      console.log("[openclaw-mcp-adapter] Shutting down...");
      await pool.closeAll();
      sharedToolCache.clear();
      sharedPool = null;
      console.log("[openclaw-mcp-adapter] All connections closed");
    },
  });
}
