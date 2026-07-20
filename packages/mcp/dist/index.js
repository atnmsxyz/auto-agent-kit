#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { loadProfile } from "./profiles.js";
const REQUEST_TIMEOUT_MS = 30_000;
function optionValue(args, name) {
    const index = args.indexOf(name);
    if (index === -1)
        return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value`);
    }
    return value;
}
function firstNonBlank(...values) {
    return values.find((value) => value?.trim())?.trim();
}
async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(input, {
            ...init,
            redirect: "error",
            signal: controller.signal,
        });
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
async function runMcpServer(args) {
    const requestedProfile = optionValue(args, "--profile") ?? process.env.AUTO_MCP_PROFILE;
    const environmentApiKey = firstNonBlank(process.env.AUTO_API_KEY);
    const stored = environmentApiKey ? null : await loadProfile(requestedProfile);
    const apiKey = environmentApiKey ?? stored?.profile.apiKey;
    if (!apiKey) {
        throw new Error("AUTO_API_KEY is required, or run 'auto setup' to create a local profile");
    }
    const apiUrl = (environmentApiKey
        ? firstNonBlank(process.env.AUTO_API_URL) ?? "https://auto.fun"
        : stored?.profile.apiUrl ?? "https://auto.fun").replace(/\/+$/, "");
    const gatewayPath = (process.env.AUTO_MCP_GATEWAY_PATH ??
        (process.env.AUTO_MCP_DEV_GATEWAY === "true" ? "/api/dev/mcp" : "/api/mcp")).replace(/\/+$/, "");
    const configuredCategories = firstNonBlank(process.env.AUTO_MCP_CATEGORIES, process.env.AUTO_MCP_GATEWAY_CATEGORIES);
    const configuredSurface = firstNonBlank(process.env.AUTO_MCP_SURFACE);
    const actionCategories = configuredCategories ??
        (configuredSurface ? undefined : stored?.profile.categories?.join(","));
    const actionSurface = configuredSurface ?? stored?.profile.surface;
    const categoryLabel = actionCategories?.trim() || actionSurface?.trim() || "default";
    const authHeaders = {
        "content-type": "application/json",
        "x-auto-api-key": apiKey,
    };
    function gatewayUrl(path) {
        const url = new URL(`${apiUrl}${path}`);
        if (actionCategories?.trim()) {
            url.searchParams.set("categories", actionCategories);
        }
        else if (actionSurface?.trim()) {
            url.searchParams.set("surface", actionSurface);
        }
        return url.toString();
    }
    async function fetchTools() {
        const response = await fetchWithTimeout(gatewayUrl(`${gatewayPath}/tools`), {
            headers: authHeaders,
        });
        if (!response.ok) {
            throw new Error(`tools list failed: ${response.status} ${await response.text()}`);
        }
        const json = (await response.json());
        if (json.success !== true || !Array.isArray(json.data?.tools)) {
            throw new Error("tools list failed: invalid gateway response");
        }
        return json.data.tools;
    }
    const server = new Server({ name: "auto-mcp", version: "0.4.0" }, {
        capabilities: { tools: {} },
        instructions: "API key access is enforced by Auto on every request; the selected surface only controls which tools are visible. Treat MCP annotations as conservative hints, inspect [WRITE] descriptions, and confirm write tool calls with the user before execution. Data reads may settle a disclosed USDC charge when not cached.",
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const tools = await fetchTools();
        return {
            tools: tools.map((tool) => ({
                name: tool.name,
                description: toolDescription(tool),
                inputSchema: tool.inputSchema,
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: true,
                    idempotentHint: false,
                    openWorldHint: true,
                },
            })),
        };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: toolArguments } = request.params;
        const response = await fetchWithTimeout(gatewayUrl(`${gatewayPath}/tools/${encodeURIComponent(name)}`), {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ params: toolArguments ?? {} }),
        });
        const text = await response.text();
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
        if (!response.ok || envelope.success !== true) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Gateway error: ${envelope.error?.message ?? text}`,
                    },
                ],
                isError: true,
            };
        }
        if (!envelope.data ||
            typeof envelope.data.actionSuccess !== "boolean") {
            return {
                content: [
                    { type: "text", text: "Invalid gateway response" },
                ],
                isError: true,
            };
        }
        const inner = envelope.data;
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        text: inner.text ?? null,
                        error: inner.error ?? null,
                        data: inner.data ?? null,
                        billing: inner.billing ?? null,
                    }, null, 2),
                },
            ],
            isError: inner.actionSuccess === false,
        };
    });
    await server.connect(new StdioServerTransport());
    process.stderr.write(`[auto-mcp] connected -> ${apiUrl}${gatewayPath} (surface=${categoryLabel}, profile=${stored?.name ?? "environment"})\n`);
}
async function main() {
    const args = process.argv.slice(2);
    await runMcpServer(args);
}
main().catch((error) => {
    process.stderr.write(`[auto-mcp] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map