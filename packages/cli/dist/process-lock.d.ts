export interface ProcessLockOwner {
    pid: number;
    startedAt: number;
}
export declare function currentProcessLockOwner(): ProcessLockOwner;
export declare function processIsRunning(pid: number): boolean;
export declare function processMatchesLockOwner(owner: Partial<ProcessLockOwner>): Promise<boolean>;
