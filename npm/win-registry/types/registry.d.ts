/**
 * Registry key implementation and facade.
 *
 * @module
 */
import type { Key, KeyInfo } from "./types.js";
/**
 * Error raised when registry operations are unavailable or fail.
 *
 * @example
 * if (!isRegistryAvailable()) throw new RegistryError("Windows Registry is unavailable");
 */
export declare class RegistryError extends Error {
    constructor(message: string, options?: ErrorOptions);
    static throwUnsupported(): never;
}
/**
 * Returns whether a Windows Registry backend is available in the current
 * runtime.
 *
 * @returns `true` when registry operations are supported on the current runtime.
 * @example
 * if (isRegistryAvailable()) {
 *   using key = Registry.openKey("HKCU\\Software");
 * }
 */
export declare function isRegistryAvailable(): boolean;
/**
 * Open registry key handle with convenience helpers for reading and writing values. Use `using` or `close()` to release opened and created keys.
 *
 * @example
 * using key = Registry.openKey("HKCU\\Software");
 * console.log(key.getSubKeyNames());
 */
export declare class RegistryKey implements Key {
    #private;
    constructor(handle: bigint, path: string, created?: boolean);
    get path(): string;
    get created(): boolean;
    isNull(): boolean;
    unwrap(): bigint;
    close(): void;
    [Symbol.dispose](): void;
    openKey(path: string, access?: number): Key;
    createKey(path: string, access?: number): Key;
    deleteKey(name: string): boolean;
    deleteValue(name: string): boolean;
    stat(): KeyInfo;
    getSubKeyNames(n?: number): string[];
    getValueNames(n?: number): string[];
    getValue(name: string, buffer?: Uint8Array): {
        data: Uint8Array;
        type: number;
    };
    getString(name: string): string;
    getMultiString(name: string): string[];
    getInt32(name: string): number;
    getInt64(name: string): bigint;
    getBinary(name: string): Uint8Array;
    setValue(name: string, data: Uint8Array, type: number): void;
    setString(name: string, value: string): void;
    setExpandString(name: string, value: string): void;
    setMultiString(name: string, value: string[]): void;
    setBinary(name: string, data: Uint8Array): void;
    setInt32(name: string, value: number): void;
    setInt64(name: string, value: bigint): void;
}
/**
 * Opens an existing registry key.
 *
 * @param path Registry path to open.
 * @param access Requested access rights.
 * @returns The opened registry key.
 */
declare function openRegistryKey(path: string, access?: number): Key;
/**
 * Opens a child key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 * @param access Requested access rights.
 * @returns The opened registry key.
 */
declare function openRegistryKey(key: Key, path: string, access?: number): Key;
/**
 * Creates a registry key if needed and opens it.
 *
 * @param path Registry path to create.
 * @param access Requested access rights.
 * @returns The created or opened registry key.
 */
declare function createRegistryKey(path: string, access?: number): Key;
/**
 * Creates a child registry key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 * @param access Requested access rights.
 * @returns The created or opened registry key.
 */
declare function createRegistryKey(key: Key, path: string, access?: number): Key;
/**
 * Deletes a registry key.
 *
 * @param path Registry path to delete.
 */
declare function deleteRegistryKey(path: string): void;
/**
 * Deletes a child key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 */
declare function deleteRegistryKey(key: Key, path: string): void;
type RegistryApi = {
    readonly HKCR: Key;
    readonly HKCU: Key;
    readonly HKLM: Key;
    readonly HKU: Key;
    readonly HKPD: Key;
    readonly HKCC: Key;
    openKey: typeof openRegistryKey;
    createKey: typeof createRegistryKey;
    deleteKey: typeof deleteRegistryKey;
};
/** Windows Registry API facade. */
export declare const Registry: RegistryApi;
export {};
