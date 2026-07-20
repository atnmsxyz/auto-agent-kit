import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveProfile, validateProfileName } from "./profiles.js";
import { configureClients, parseClientList } from "./installers.js";
const CUSTOM_CATEGORIES = new Set([
    "perps",
    "market-data",
    "derivatives",
    "trader-intel",
    "onchain-analytics",
    "market-prices",
    "defi-analytics",
    "token-data",
    "technicals",
    "web-news",
    "macro",
    "wallet",
    "wallet-execution",
    "prediction-markets",
    "spot",
    "limit-orders",
    "trading",
]);
const WRITE_TOOL_CATEGORIES = new Set([
    "perps",
    "wallet-execution",
    "prediction-markets",
    "spot",
    "limit-orders",
    "trading",
]);
const WRITE_ONLY_CUSTOM_CATEGORIES = new Set(["wallet-execution", "spot"]);
const ACKNOWLEDGEMENT_ATTEMPTS = 3;
class SetupAcknowledgementUncertainError extends Error {
    constructor(cause) {
        super("Auto setup acknowledgement completion is uncertain; the verified local profile was preserved. Re-run setup only after checking the profile in Auto.", { cause });
        this.name = "SetupAcknowledgementUncertainError";
    }
}
class SetupRedirectError extends Error {
    constructor() {
        super("Auto setup refused an unexpected HTTP redirect");
        this.name = "SetupRedirectError";
    }
}
function sameCategories(left, right) {
    return JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());
}
function profileMatchesRequest(profile, request) {
    const expectedAccess = request.preset === "research"
        ? "read"
        : request.preset === "custom"
            ? request.accessPreset
            : "read_write";
    const expectedSurface = request.preset === "custom"
        ? request.accessPreset === "read_write"
            ? "trading"
            : "research"
        : request.preset;
    return (profile.id === request.preset &&
        profile.accessPreset === expectedAccess &&
        profile.surface === expectedSurface &&
        sameCategories(profile.categories, request.categories));
}
class SetupApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
function normalizeApiUrl() {
    return (process.env.AUTO_API_URL?.trim() || "https://auto.fun").replace(/\/+$/, "");
}
async function fetchSetupJson(url, init) {
    const timeoutMs = Number.parseInt(process.env.AUTO_MCP_SETUP_REQUEST_TIMEOUT_MS ?? "15000", 10);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
        throw new Error("AUTO_MCP_SETUP_REQUEST_TIMEOUT_MS must be a positive integer");
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        const response = await fetch(url, {
            ...init,
            redirect: "manual",
            signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
            throw new SetupRedirectError();
        }
        const payload = (await response.json());
        return { response, payload };
    }
    catch (error) {
        if (timedOut) {
            throw new Error(`Auto setup request timed out after ${timeoutMs}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
async function postJson(apiUrl, path, body) {
    const { response, payload } = await fetchSetupJson(`${apiUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok || payload.success !== true || payload.data === undefined) {
        throw new SetupApiError(payload.error?.message ?? `Auto setup request failed (${response.status})`, response.status, payload.error?.code);
    }
    return payload.data;
}
async function acknowledgeSetup(apiUrl, deviceCode) {
    let lastError;
    let completionMayHaveSucceeded = false;
    for (let attempt = 1; attempt <= ACKNOWLEDGEMENT_ATTEMPTS; attempt += 1) {
        try {
            await postJson(apiUrl, "/api/auth/mcp-setup/acknowledge", { deviceCode });
            return;
        }
        catch (error) {
            if (error instanceof SetupApiError &&
                error.status >= 400 &&
                error.status < 500) {
                if (completionMayHaveSucceeded) {
                    throw new SetupAcknowledgementUncertainError(error);
                }
                throw error;
            }
            completionMayHaveSucceeded = true;
            lastError = error;
            if (attempt < ACKNOWLEDGEMENT_ATTEMPTS)
                await wait(100);
        }
    }
    throw new SetupAcknowledgementUncertainError(lastError);
}
async function verifyApprovedProfile(apiUrl, apiKey, profile) {
    const url = new URL(`${apiUrl}/api/mcp/tools`);
    if (profile.categories?.length) {
        url.searchParams.set("categories", profile.categories.join(","));
    }
    else {
        url.searchParams.set("surface", profile.surface);
    }
    const { response, payload } = await fetchSetupJson(url, { headers: { "x-auto-api-key": apiKey } });
    if (!response.ok || payload.success !== true || !Array.isArray(payload.data?.tools)) {
        throw new Error(payload.error?.message ?? `Profile verification failed (${response.status})`);
    }
    const tools = payload.data.tools;
    if (tools.length === 0) {
        throw new Error(`Verification failed: ${profile.name} did not expose any tools`);
    }
    const writeCount = tools.filter((tool) => tool.write === true).length;
    if (profile.accessPreset === "read" && writeCount > 0) {
        throw new Error(`Safety verification failed: ${profile.name} exposed ${writeCount} write tool(s)`);
    }
    const expectsWriteTools = profile.id === "perps" ||
        profile.id === "trading" ||
        profile.categories?.some((category) => WRITE_TOOL_CATEGORIES.has(category));
    if (profile.accessPreset === "read_write" && expectsWriteTools && writeCount === 0) {
        throw new Error(`Verification failed: ${profile.name} did not expose any write tools`);
    }
    return { toolCount: tools.length, writeCount };
}
export function externalUrlCommand(url, platform = process.platform) {
    return platform === "darwin"
        ? { file: "open", args: [url] }
        : platform === "win32"
            ? { file: "explorer.exe", args: [url] }
            : { file: "xdg-open", args: [url] };
}
function openExternalUrl(url) {
    const command = externalUrlCommand(url);
    const child = spawn(command.file, command.args, {
        detached: true,
        stdio: "ignore",
    });
    child.once("error", () => {
        // The verification URL is already printed, so manual opening remains available.
    });
    child.unref();
}
function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function resolveInteractiveOptions(options) {
    let { profileName, preset, clientName, install } = options;
    let access = options.access;
    let categoriesInput = options.categories;
    if ((!profileName || !preset || !clientName) && !stdin.isTTY) {
        throw new Error("Interactive setup needs a terminal. Supply --profile, --preset, and --client for non-interactive use.");
    }
    if (!profileName || !preset || !clientName) {
        const prompt = createInterface({ input: stdin, output: stdout });
        try {
            stdout.write("Choose a tool profile:\n  1. Research (Read)\n  2. Perps trading (Read + Write)\n  3. Full trading (Read + Write)\n  4. Advanced custom tool set\n");
            if (!preset) {
                const answer = (await prompt.question("Profile [1]: ")).trim() || "1";
                preset = {
                    "1": "research",
                    "2": "perps",
                    "3": "trading",
                    "4": "custom",
                }[answer];
            }
            if (preset === "custom") {
                if (!access) {
                    const answer = (await prompt.question("API access: 1. Read  2. Read + Write [1]: ")).trim() || "1";
                    access = answer === "1" ? "read" : answer === "2" ? "read_write" : answer;
                }
                if (!categoriesInput) {
                    categoriesInput = await prompt.question("Visible categories (comma-separated, e.g. market-prices,macro): ");
                }
            }
            if (!profileName) {
                profileName =
                    (await prompt.question("Local profile name [auto]: ")).trim() || "auto";
            }
            if (!clientName) {
                clientName =
                    (await prompt.question("AI client name [Auto MCP CLI]: ")).trim() ||
                        "Auto MCP CLI";
            }
            if (install === undefined) {
                install = (await prompt.question("Install into clients (comma-separated or 'all') [none]: ")).trim();
            }
        }
        finally {
            prompt.close();
        }
    }
    if (preset !== "research" &&
        preset !== "perps" &&
        preset !== "trading" &&
        preset !== "custom") {
        throw new Error("--preset must be research, perps, trading, or custom");
    }
    let categories;
    let accessPreset;
    if (preset === "custom") {
        if (access !== "read" && access !== "read_write") {
            throw new Error("Custom setup requires --access read or --access read_write");
        }
        categories = (categoriesInput ?? "")
            .split(",")
            .map((category) => category.trim().toLowerCase().replaceAll("_", "-"))
            .filter(Boolean);
        const invalid = categories.filter((category) => !CUSTOM_CATEGORIES.has(category));
        if (categories.length === 0 || invalid.length > 0) {
            throw new Error(`Custom setup needs supported categories. Invalid: ${invalid.join(", ") || "none selected"}`);
        }
        if (access === "read" &&
            categories.every((category) => WRITE_ONLY_CUSTOM_CATEGORIES.has(category))) {
            throw new Error("A custom Read profile needs at least one read-capable category");
        }
        categories = [...new Set(categories)];
        accessPreset = access;
    }
    return {
        profileName: validateProfileName(profileName),
        preset,
        clientName: clientName.trim(),
        install,
        accessPreset,
        categories,
    };
}
export async function runSetup(options) {
    const resolved = await resolveInteractiveOptions(options);
    const clients = parseClientList(resolved.install);
    const apiUrl = normalizeApiUrl();
    const started = await postJson(apiUrl, "/api/auth/mcp-setup/authorizations", {
        profile: resolved.preset,
        clientName: resolved.clientName,
        ...(resolved.preset === "custom"
            ? {
                accessPreset: resolved.accessPreset,
                categories: resolved.categories,
            }
            : {}),
    });
    if (!profileMatchesRequest(started.profile, resolved)) {
        throw new Error("Auto returned a setup profile that does not match the request");
    }
    if (!Number.isFinite(started.intervalSeconds) ||
        started.intervalSeconds <= 0 ||
        !Number.isFinite(started.expiresAt) ||
        started.expiresAt <= Date.now()) {
        throw new Error("Auto returned invalid authorization timing");
    }
    stdout.write(`\nOpen Auto in your browser:\n${started.verificationUri}\n`);
    stdout.write(`Confirm setup code: ${started.userCode}\n\n`);
    if (options.openBrowser)
        openExternalUrl(started.verificationUri);
    stdout.write("Waiting for approval…\n");
    let exchange = null;
    while (Date.now() < started.expiresAt) {
        try {
            exchange = await postJson(apiUrl, "/api/auth/mcp-setup/token", { deviceCode: started.deviceCode });
            break;
        }
        catch (error) {
            const retryable = error instanceof SetupApiError
                ? error.code === "AUTHORIZATION_PENDING" || error.status >= 500
                : !(error instanceof SetupRedirectError);
            if (retryable) {
                await wait(Math.max(0, started.intervalSeconds * 1000));
                continue;
            }
            throw error;
        }
    }
    if (!exchange) {
        throw new Error("Setup request expired before it was approved");
    }
    if (!profileMatchesRequest(exchange.profile, resolved) ||
        exchange.profile.accessPreset !== started.profile.accessPreset ||
        exchange.profile.surface !== started.profile.surface ||
        !sameCategories(exchange.profile.categories, started.profile.categories)) {
        throw new Error("Approved setup profile does not match the requested profile");
    }
    const verified = await verifyApprovedProfile(apiUrl, exchange.apiKey, exchange.profile);
    stdout.write(`Verified ${verified.toolCount} ${verified.toolCount === 1 ? "tool" : "tools"} (${verified.writeCount} write) on the ${exchange.profile.name} profile.\n`);
    const rollbackProfile = await saveProfile(resolved.profileName, {
        apiKey: exchange.apiKey,
        apiUrl,
        accessPreset: exchange.profile.accessPreset,
        surface: exchange.profile.surface,
        categories: exchange.profile.categories,
    });
    try {
        await acknowledgeSetup(apiUrl, started.deviceCode);
    }
    catch (acknowledgementError) {
        if (acknowledgementError instanceof SetupAcknowledgementUncertainError) {
            throw acknowledgementError;
        }
        try {
            await rollbackProfile();
        }
        catch (rollbackError) {
            throw new AggregateError([acknowledgementError, rollbackError], "Auto setup acknowledgement failed and the previous profile could not be restored");
        }
        throw acknowledgementError;
    }
    stdout.write(`Connected. Profile '${resolved.profileName}' is stored securely and ready to use.\n`);
    if (clients.length > 0) {
        await configureClients({
            profileName: resolved.profileName,
            clients,
            printOnly: options.printOnly,
            replace: options.replace,
        });
    }
}
//# sourceMappingURL=setup.js.map