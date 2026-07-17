export declare const CLIENT_IDS: readonly ["claude-code", "claude-desktop", "codex", "cursor", "windsurf", "vscode", "gemini"];
export type ClientId = (typeof CLIENT_IDS)[number];
interface ConfigureClientsOptions {
    profileName: string;
    clients: ClientId[];
    printOnly: boolean;
    replace: boolean;
}
export declare function parseClientList(value: string | undefined): ClientId[];
export declare function configureClients({ profileName, clients, printOnly, replace, }: ConfigureClientsOptions): Promise<void>;
export {};
