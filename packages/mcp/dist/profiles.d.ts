export type McpSurface = "research" | "perps" | "trading";
export interface StoredProfile {
    apiKey: string;
    apiUrl: string;
    accessPreset: "read" | "read_write";
    surface: McpSurface;
    categories?: string[];
    createdAt: string;
    updatedAt: string;
}
export declare function loadProfile(name?: string): Promise<{
    name: string;
    profile: StoredProfile;
}>;
