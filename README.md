# OpenClaw MCP Adapter

Exposes MCP (Model Context Protocol) server tools as native OpenClaw agent tools.

Instead of running MCP servers through a CLI skill, this plugin connects to your MCP servers at startup, discovers their tools, and registers each one as a first-class tool that agents can invoke directly.

## Requirements

- OpenClaw gateway
- Node.js 18+
- MCP servers you want to connect to

## Installation

```bash
openclaw plugins install openclaw-mcp-adapter
```

**Alternative: install from source**

```bash
git clone https://github.com/androidStern/openclaw-mcp-adapter.git
openclaw plugins install ./openclaw-mcp-adapter
```

## Configuration

### 1. Enable the plugin and configure servers

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-mcp-adapter": {
        "enabled": true,
        "config": {
          "servers": [
            {
              "name": "myserver",
              "transport": "stdio",
              "command": "npx",
              "args": ["-y", "some-mcp-server"],
              "env": {
                "API_KEY": "${MY_API_KEY}"
              }
            }
          ]
        }
      }
    }
  }
}
```

### 2. Allow for sandboxed agents

Add `"openclaw-mcp-adapter"` to your sandbox tool allowlist:

```json
{
  "tools": {
    "sandbox": {
      "tools": {
        "allow": ["group:runtime", "group:fs", "openclaw-mcp-adapter"]
      }
    }
  }
}
```

### 3. Restart the gateway

```bash
openclaw gateway restart
```

### 4. Verify

```bash
openclaw plugins list
# Should show: OpenClaw MCP Adapter | openclaw-mcp-adapter | loaded
```

## Server Configuration

### Stdio transport (spawns a subprocess)

```json
{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-filesystem", "/path/to/dir"],
  "env": {
    "SOME_VAR": "value"
  }
}
```

### HTTP transport (connects to a running server)

```json
{
  "name": "api",
  "transport": "http",
  "url": "http://localhost:3000/mcp",
  "headers": {
    "Authorization": "Bearer ${API_TOKEN}"
  }
}
```

## Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `servers` | array | `[]` | List of MCP servers to connect to |
| `toolPrefix` | boolean | `true` | Prefix tool names with server name using double underscore (e.g., `myserver__toolname`) |

### Server Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | Yes | Unique name for this server |
| `transport` | `"stdio"` \| `"http"` | No | Connection type (default: `stdio`) |
| `command` | string | stdio only | Command to spawn |
| `args` | string[] | No | Command arguments |
| `env` | object | No | Environment variables |
| `url` | string | http only | Server URL |
| `headers` | object | No | HTTP request headers |

## Environment Variable Interpolation

Use `${VAR_NAME}` in `env` and `headers` values to reference environment variables from `~/.openclaw/.env`:

```json
{
  "env": {
    "API_KEY": "${MY_SERVICE_API_KEY}"
  }
}
```

## How It Works

1. On gateway startup, `register()` registers a factory function per configured MCP server
2. `service.start()` connects to each server and calls `listTools()` to discover available tools
3. Discovered tools are stored in a module-level shared cache (survives across plugin reloads)
4. When a session resolves tools, the factory returns cached tool definitions registered with OpenClaw
5. Sub-agent sessions with empty `pluginConfig` fall back to the shared cache from the primary gateway instance
6. When an agent invokes a tool, the plugin proxies the call to the MCP server
7. If the connection dies, it automatically reconnects on the next tool call

## Example: AgentMail

```json
{
  "name": "agentmail",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "agentmail-mcp"],
  "env": {
    "AGENTMAIL_API_KEY": "${AGENTMAIL_API_KEY}"
  }
}
```

This registers tools like `agentmail_create_inbox`, `agentmail_send_email`, etc.

## License

MIT
