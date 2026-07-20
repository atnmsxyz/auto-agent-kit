export type AccessPreset = "read" | "read_write";
export type McpSurface = "research" | "perps" | "trading";
export interface StoredProfile {
    apiKey: string;
    apiUrl: string;
    accessPreset: AccessPreset;
    surface: McpSurface;
    categories?: string[];
    createdAt: string;
    updatedAt: string;
}
export interface StagedProfile {
    commit(): Promise<void>;
    rollback(): Promise<void>;
}
export declare function profilesPath(): string;
export declare function validateProfileName(name: string): string;
export declare function loadProfile(name?: string): Promise<{
    name: string;
    profile: StoredProfile;
}>;
export declare function saveProfile(name: string, profile: Omit<StoredProfile, "createdAt" | "updatedAt">): Promise<() => Promise<void>>;
export declare function stageProfile(name: string, profile: Omit<StoredProfile, "createdAt" | "updatedAt">): Promise<StagedProfile>;
