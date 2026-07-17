interface SetupOptions {
    profileName?: string;
    preset?: string;
    clientName?: string;
    openBrowser: boolean;
    install?: string;
    printOnly: boolean;
    replace: boolean;
    access?: string;
    categories?: string;
}
export declare function externalUrlCommand(url: string, platform?: NodeJS.Platform): {
    file: string;
    args: string[];
};
export declare function runSetup(options: SetupOptions): Promise<void>;
export {};
