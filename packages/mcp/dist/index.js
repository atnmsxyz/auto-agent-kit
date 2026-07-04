#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
const API_URL = (process.env.AUTO_API_URL ?? "https://auto.fun").replace(/\/+$/, "");
const API_KEY = process.env.AUTO_API_KEY;
const GATEWAY_PATH = (process.env.AUTO_MCP_GATEWAY_PATH ??
    (process.env.AUTO_MCP_DEV_GATEWAY === "true" ? "/api/dev/mcp" : "/api/mcp")).replace(/\/+$/, "");
const ACTION_CATEGORIES = process.env.AUTO_MCP_CATEGORIES ?? process.env.AUTO_MCP_GATEWAY_CATEGORIES;
const ACTION_SURFACE = process.env.AUTO_MCP_SURFACE;
const CATEGORY_LABEL = ACTION_CATEGORIES?.trim() || ACTION_SURFACE?.trim() || "default";
const REQUEST_TIMEOUT_MS = 30_000;
if (!API_KEY) {
    process.stderr.write("[auto-mcp] AUTO_API_KEY is required\n");
    process.exit(1);
}
const authHeaders = {
    "content-type": "application/json",
    "x-auto-api-key": API_KEY,
};
function gatewayUrl(path) {
    const url = new URL(`${API_URL}${path}`);
    if (ACTION_CATEGORIES?.trim()) {
        url.searchParams.set("categories", ACTION_CATEGORIES);
    }
    else if (ACTION_SURFACE?.trim()) {
        url.searchParams.set("surface", ACTION_SURFACE);
    }
    return url.toString();
}
async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
}
function toolDescription(tool) {
    const writePrefix = tool.write ? "[WRITE] " : "";
    const categoryPrefix = tool.categories?.length
        ? `[${tool.categories.join(",")}] `
        : "";
    return `${writePrefix}${categoryPrefix}${tool.description}`;
}
async function fetchTools() {
    const res = await fetchWithTimeout(gatewayUrl(`${GATEWAY_PATH}/tools`), {
        headers: authHeaders,
    });
    if (!res.ok) {
        throw new Error(`tools list failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json());
    return json.data?.tools ?? [];
}
const server = new Server({ name: "auto-mcp", version: "0.1.1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await fetchTools();
    return {
        tools: tools.map((tool) => ({
            name: tool.name,
            description: toolDescription(tool),
            inputSchema: tool.inputSchema,
        })),
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const res = await fetchWithTimeout(gatewayUrl(`${GATEWAY_PATH}/tools/${encodeURIComponent(name)}`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ params: args ?? {} }),
    });
    const text = await res.text();
    let envelope;
    try {
        envelope = JSON.parse(text);
    }
    catch {
        return {
            content: [{ type: "text", text: `Non-JSON response: ${text}` }],
            isError: true,
        };
    }
    if (!res.ok || envelope.success === false) {
        const msg = envelope.error?.message ?? text;
        return {
            content: [{ type: "text", text: `Gateway error: ${msg}` }],
            isError: true,
        };
    }
    const inner = envelope.data ?? {};
    const payload = {
        text: inner.text ?? null,
        error: inner.error ?? null,
        data: inner.data ?? null,
        billing: inner.billing ?? null,
    };
    return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        isError: inner.actionSuccess === false,
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[auto-mcp] connected -> ${API_URL}${GATEWAY_PATH} (surface=${CATEGORY_LABEL})\n`);
}
main().catch((err) => {
    process.stderr.write(`[auto-mcp] fatal: ${String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map