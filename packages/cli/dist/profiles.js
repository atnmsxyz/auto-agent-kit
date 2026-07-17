import { execFile } from "node:child_process";
import { chmod, copyFile, link, mkdir, open, readFile, rename, stat, unlink, } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROFILE_LOCK_RETRY_MS = 25;
const PROFILE_LOCK_TIMEOUT_MS = 5_000;
const PROFILE_LOCK_STALE_MS = 30_000;
const execFileAsync = promisify(execFile);
async function hardenWindowsAcl(target, directory) {
    if (process.platform !== "win32")
        return;
    const username = process.env.USERNAME?.trim();
    if (!username) {
        throw new Error("Windows profile ACL hardening failed: USERNAME is unavailable");
    }
    const domain = process.env.USERDOMAIN?.trim();
    const principal = domain ? `${domain}\\${username}` : username;
    const aclScript = [
        "$acl = Get-Acl -LiteralPath $args[0];",
        "$acl.SetAccessRuleProtection($true, $false);",
        "@($acl.Access) | ForEach-Object { [void]$acl.RemoveAccessRuleSpecific($_) };",
        "$rights = [System.Security.AccessControl.FileSystemRights]::FullControl;",
        "$inheritance = if ($args[2] -eq 'true') { [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit } else { [System.Security.AccessControl.InheritanceFlags]::None };",
        "$propagation = [System.Security.AccessControl.PropagationFlags]::None;",
        "$accessType = [System.Security.AccessControl.AccessControlType]::Allow;",
        "$rule = [System.Security.AccessControl.FileSystemAccessRule]::new($args[1], $rights, $inheritance, $propagation, $accessType);",
        "[void]$acl.AddAccessRule($rule);",
        "Set-Acl -LiteralPath $args[0] -AclObject $acl;",
    ].join(" ");
    try {
        await execFileAsync("powershell.exe", [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            aclScript,
            target,
            principal,
            String(directory),
        ], { windowsHide: true });
    }
    catch (error) {
        throw new Error(`Windows profile ACL hardening failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export function profilesPath() {
    return path.join(os.homedir(), ".auto", "mcp", "profiles.json");
}
export function validateProfileName(name) {
    const normalized = name.trim();
    if (!PROFILE_NAME_PATTERN.test(normalized)) {
        throw new Error("Profile names must be 1-64 characters using letters, numbers, dot, underscore, or hyphen");
    }
    return normalized;
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
function ownProfile(profiles, name) {
    return Object.hasOwn(profiles, name) ? profiles[name] : undefined;
}
function parseProfileFile(contents) {
    let parsed;
    try {
        parsed = JSON.parse(contents);
    }
    catch (error) {
        throw new Error(`Auto MCP profile file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Auto MCP profile file must contain an object");
    }
    const record = parsed;
    if (record.version !== 1 ||
        typeof record.activeProfile !== "string" ||
        !record.profiles ||
        typeof record.profiles !== "object" ||
        Array.isArray(record.profiles)) {
        throw new Error("Auto MCP profile file has an unsupported structure");
    }
    for (const [name, profile] of Object.entries(record.profiles)) {
        validateProfileName(name);
        if (!isStoredProfile(profile)) {
            throw new Error(`Auto MCP profile '${name}' is invalid`);
        }
    }
    return parsed;
}
async function readProfilesFile() {
    try {
        return {
            file: parseProfileFile(await readFile(profilesPath(), "utf8")),
            existed: true,
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return {
                file: { version: 1, activeProfile: "", profiles: {} },
                existed: false,
            };
        }
        throw error;
    }
}
function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function processIsRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code !== "ESRCH";
    }
}
async function prepareProfilesDirectory() {
    const directory = path.dirname(profilesPath());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    await hardenWindowsAcl(directory, true);
}
async function unlinkIfExists(target) {
    try {
        await unlink(target);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
}
async function lockFileIsAbandoned(target) {
    let owner;
    try {
        owner = JSON.parse(await readFile(target, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return true;
        if (!(error instanceof SyntaxError))
            throw error;
    }
    let modifiedAt;
    try {
        modifiedAt = (await stat(target)).mtimeMs;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return true;
        throw error;
    }
    const ownerPid = owner?.pid;
    const hasValidPid = typeof ownerPid === "number" &&
        Number.isInteger(ownerPid) &&
        ownerPid > 0;
    if (Date.now() - modifiedAt >= PROFILE_LOCK_STALE_MS)
        return true;
    return hasValidPid ? !processIsRunning(ownerPid) : false;
}
async function recoverAbandonedRecoveryGuard(recoveryPath) {
    const claimPath = `${recoveryPath}.${process.pid}.${crypto.randomUUID()}.claim`;
    try {
        await link(recoveryPath, claimPath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return true;
        throw error;
    }
    try {
        if (!(await lockFileIsAbandoned(claimPath)))
            return false;
        let current;
        let claim;
        try {
            [current, claim] = await Promise.all([stat(recoveryPath), stat(claimPath)]);
        }
        catch (error) {
            if (error.code === "ENOENT")
                return true;
            throw error;
        }
        if (current.dev !== claim.dev || current.ino !== claim.ino)
            return false;
        await unlinkIfExists(recoveryPath);
        return true;
    }
    finally {
        await unlinkIfExists(claimPath);
    }
}
async function recoverAbandonedProfilesLock(lockPath, recoveryPath) {
    let recoveryHandle;
    try {
        recoveryHandle = await open(recoveryPath, "wx", 0o600);
    }
    catch (error) {
        if (error.code === "EEXIST")
            return false;
        throw error;
    }
    try {
        await recoveryHandle.writeFile(JSON.stringify({ pid: process.pid }), "utf8");
        await recoveryHandle.sync();
    }
    catch (error) {
        await recoveryHandle.close();
        await unlinkIfExists(recoveryPath);
        throw error;
    }
    await recoveryHandle.close();
    try {
        if (!(await lockFileIsAbandoned(lockPath)))
            return false;
        await unlinkIfExists(lockPath);
        return true;
    }
    finally {
        await unlinkIfExists(recoveryPath);
    }
}
async function acquireProfilesLock() {
    await prepareProfilesDirectory();
    const lockPath = `${profilesPath()}.lock`;
    const recoveryPath = `${lockPath}.recovery`;
    const deadline = Date.now() + PROFILE_LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            await stat(recoveryPath);
            if (await recoverAbandonedRecoveryGuard(recoveryPath))
                continue;
            if (Date.now() >= deadline) {
                throw new Error("Timed out waiting for Auto MCP profile lock recovery");
            }
            await wait(PROFILE_LOCK_RETRY_MS);
            continue;
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        try {
            const handle = await open(lockPath, "wx", 0o600);
            let initializationError;
            try {
                await handle.writeFile(JSON.stringify({ pid: process.pid }), "utf8");
                await handle.sync();
            }
            catch (error) {
                initializationError = error;
            }
            finally {
                await handle.close();
            }
            if (initializationError) {
                await unlink(lockPath).catch((error) => {
                    if (error.code !== "ENOENT")
                        throw error;
                });
                throw initializationError;
            }
            return async () => {
                await unlink(lockPath).catch((error) => {
                    if (error.code !== "ENOENT")
                        throw error;
                });
            };
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            if (await recoverAbandonedProfilesLock(lockPath, recoveryPath))
                continue;
            if (Date.now() >= deadline) {
                throw new Error("Timed out waiting for the Auto MCP profile store lock");
            }
            await wait(PROFILE_LOCK_RETRY_MS);
        }
    }
}
async function writeProfilesFile(file) {
    parseProfileFile(JSON.stringify(file));
    const destination = profilesPath();
    const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const preserved = `${destination}.${process.pid}.${crypto.randomUUID()}.previous`;
    const handle = await open(temporary, "wx", 0o600);
    let writeError;
    try {
        await hardenWindowsAcl(temporary, false);
        await handle.writeFile(`${JSON.stringify(file, null, 2)}\n`, "utf8");
        await handle.sync();
    }
    catch (error) {
        writeError = error;
    }
    finally {
        await handle.close();
    }
    if (writeError) {
        await unlinkIfExists(temporary);
        throw writeError;
    }
    let hadPreviousStore = true;
    try {
        await copyFile(destination, preserved);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            hadPreviousStore = false;
        }
        else {
            await unlinkIfExists(temporary);
            throw error;
        }
    }
    let replaced = false;
    try {
        await rename(temporary, destination);
        replaced = true;
        await chmod(destination, 0o600);
        await hardenWindowsAcl(destination, false);
        parseProfileFile(await readFile(destination, "utf8"));
        if (hadPreviousStore)
            await unlink(preserved);
    }
    catch (error) {
        try {
            if (replaced) {
                if (hadPreviousStore)
                    await rename(preserved, destination);
                else
                    await unlinkIfExists(destination);
            }
            else {
                await unlinkIfExists(temporary);
                if (hadPreviousStore)
                    await unlinkIfExists(preserved);
            }
        }
        catch (restoreError) {
            throw new AggregateError([error, restoreError], "Auto MCP profile save failed and the previous credential store could not be restored");
        }
        throw error;
    }
}
export async function loadProfile(name) {
    const { file } = await readProfilesFile();
    const profileName = validateProfileName(name || file.activeProfile);
    const profile = ownProfile(file.profiles, profileName);
    if (!profile) {
        throw new Error(`Auto MCP profile '${profileName}' was not found. Run 'auto setup' first.`);
    }
    return { name: profileName, profile };
}
export async function saveProfile(name, profile) {
    const profileName = validateProfileName(name);
    const release = await acquireProfilesLock();
    let previous;
    let next;
    try {
        previous = await readProfilesFile();
        const { file } = previous;
        const existingProfile = ownProfile(file.profiles, profileName);
        const now = new Date().toISOString();
        next = {
            version: 1,
            activeProfile: profileName,
            profiles: {
                ...file.profiles,
                [profileName]: {
                    ...profile,
                    createdAt: existingProfile?.createdAt ?? now,
                    updatedAt: now,
                },
            },
        };
        await writeProfilesFile(next);
        const persisted = parseProfileFile(await readFile(profilesPath(), "utf8"));
        if (ownProfile(persisted.profiles, profileName)?.apiKey !== profile.apiKey) {
            throw new Error("Auto MCP profile verification failed after saving");
        }
    }
    finally {
        await release();
    }
    return async () => {
        const releaseRollback = await acquireProfilesLock();
        try {
            const current = await readProfilesFile();
            if (!current.existed)
                return;
            const savedProfile = ownProfile(next.profiles, profileName);
            if (JSON.stringify(ownProfile(current.file.profiles, profileName)) !==
                JSON.stringify(savedProfile)) {
                return;
            }
            const profiles = { ...current.file.profiles };
            const previousProfile = ownProfile(previous.file.profiles, profileName);
            if (previousProfile)
                profiles[profileName] = previousProfile;
            else
                delete profiles[profileName];
            let activeProfile = current.file.activeProfile;
            if (activeProfile === profileName) {
                activeProfile =
                    previous.file.activeProfile &&
                        ownProfile(profiles, previous.file.activeProfile)
                        ? previous.file.activeProfile
                        : (Object.keys(profiles)[0] ?? "");
            }
            if (!previous.existed && Object.keys(profiles).length === 0) {
                try {
                    await unlink(profilesPath());
                }
                catch (error) {
                    if (error.code !== "ENOENT")
                        throw error;
                }
                return;
            }
            await writeProfilesFile({ version: 1, activeProfile, profiles });
        }
        finally {
            await releaseRollback();
        }
    };
}
//# sourceMappingURL=profiles.js.map