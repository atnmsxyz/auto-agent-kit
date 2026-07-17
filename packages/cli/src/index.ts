#!/usr/bin/env node
import { configureClients, parseClientList } from "./installers.js";
import { loadProfile } from "./profiles.js";
import { runSetup } from "./setup.js";

function optionValue(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${name} requires a value`);
	}
	return value;
}

function hasOption(args: string[], name: string): boolean {
	return args.includes(name);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args[0] === "setup") {
		await runSetup({
			profileName: optionValue(args, "--profile"),
			preset: optionValue(args, "--preset"),
			clientName: optionValue(args, "--client"),
			openBrowser: !hasOption(args, "--no-open"),
			install: optionValue(args, "--install"),
			printOnly: hasOption(args, "--print-only"),
			replace: hasOption(args, "--replace"),
			access: optionValue(args, "--access"),
			categories: optionValue(args, "--categories"),
		});
		return;
	}
	if (args[0] === "configure") {
		const install = optionValue(args, "--install");
		if (!install) {
			throw new Error(
				"configure requires --install <client[,client...]> or --install all",
			);
		}
		const loaded = await loadProfile(optionValue(args, "--profile"));
		await configureClients({
			profileName: loaded.name,
			clients: parseClientList(install),
			printOnly: hasOption(args, "--print-only"),
			replace: hasOption(args, "--replace"),
		});
		return;
	}
	throw new Error("Usage: auto <setup|configure> [options]");
}

main().catch((error) => {
	process.stderr.write(
		`[auto] ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
});
