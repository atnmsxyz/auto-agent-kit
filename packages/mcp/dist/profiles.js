import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function validateProfileName(name) {
    const normalized = name.trim();
    if (!PROFILE_NAME_PATTERN.test(normalized)) {
        throw new Error("Profile names must be 1-64 characters using letters, numbers, dot, underscore, or hyphen");
    }
    return normalized;
}
function profilesPath() {
    return path.join(os.homedir(), ".auto", "mcp", "profiles.json");
}
function isStoredProfile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const record = value;
    return (typeof record.apiKey === "string" &&
        record.apiKey.startsWith("atk_") &&
        typeof record.apiUrl === "string" &&
        (record.accessPreset === "read" || record.accessPreset === "read_write") &&
        (record.surface === "research" ||
            record.surface === "perps" ||
            record.surface === "trading") &&
        (record.categories === undefined ||
            (Array.isArray(record.categories) &&
                record.categories.every((category) => typeof category === "string"))) &&
        typeof record.createdAt === "string" &&
        typeof record.updatedAt === "string");
}
export async function loadProfile(name) {
    let parsed;
    try {
        parsed = JSON.parse(await readFile(profilesPath(), "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error("No Auto MCP profiles found. Run 'auto setup' first.");
        }
        throw new Error(`Auto MCP profile file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Auto MCP profile file must contain an object");
    }
    const file = parsed;
    if (file.version !== 1 ||
        typeof file.activeProfile !== "string" ||
        !file.profiles ||
        typeof file.profiles !== "object" ||
        Array.isArray(file.profiles)) {
        throw new Error("Auto MCP profile file has an unsupported structure");
    }
    const profileName = validateProfileName(name || file.activeProfile);
    const profile = Object.hasOwn(file.profiles, profileName)
        ? file.profiles[profileName]
        : undefined;
    if (!isStoredProfile(profile)) {
        throw new Error(`Auto MCP profile '${profileName}' was not found or is invalid. Run 'auto setup' first.`);
    }
    return { name: profileName, profile };
}
//# sourceMappingURL=profiles.js.map