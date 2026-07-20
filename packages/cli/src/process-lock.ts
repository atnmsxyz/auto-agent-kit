import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface ProcessLockOwner {
	pid: number;
	startedAt: number;
}

const execFileAsync = promisify(execFile);
const PROCESS_STARTED_AT_MS = Date.now() - process.uptime() * 1_000;
const PROCESS_START_TOLERANCE_MS = 2_000;

export function currentProcessLockOwner(): ProcessLockOwner {
	return { pid: process.pid, startedAt: PROCESS_STARTED_AT_MS };
}

export function processIsRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

async function processStartedAt(pid: number): Promise<number | null> {
	if (pid === process.pid) return PROCESS_STARTED_AT_MS;
	try {
		if (process.platform === "win32") {
			const { stdout } = await execFileAsync(
				"powershell.exe",
				[
					"-NoLogo",
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					"(Get-Process -Id ([int]$env:AUTO_MCP_LOCK_PID)).StartTime.ToUniversalTime().ToString('o')",
				],
				{
					env: { ...process.env, AUTO_MCP_LOCK_PID: String(pid) },
					timeout: 2_000,
					windowsHide: true,
				},
			);
			const parsed = Date.parse(stdout.trim());
			return Number.isFinite(parsed) ? parsed : null;
		}
		const { stdout } = await execFileAsync(
			"ps",
			["-o", "lstart=", "-p", String(pid)],
			{ timeout: 2_000 },
		);
		const parsed = Date.parse(stdout.trim());
		return Number.isFinite(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export async function processMatchesLockOwner(
	owner: Partial<ProcessLockOwner>,
): Promise<boolean> {
	if (
		typeof owner.pid !== "number" ||
		!Number.isInteger(owner.pid) ||
		owner.pid <= 0 ||
		!processIsRunning(owner.pid)
	) {
		return false;
	}
	if (typeof owner.startedAt !== "number" || !Number.isFinite(owner.startedAt)) {
		return true;
	}
	const actualStartedAt = await processStartedAt(owner.pid);
	return (
		actualStartedAt === null ||
		Math.abs(actualStartedAt - owner.startedAt) <= PROCESS_START_TOLERANCE_MS
	);
}
