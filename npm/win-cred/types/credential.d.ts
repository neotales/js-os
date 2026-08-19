import type { Credential } from "./types.js";
import { CredEnumerateFlags, CredPersist, CredType, CredWriteFlags } from "./types.js";
/**
 * Returns whether a Windows Credential Manager backend is available in the
 * current runtime.
 *
 * @returns `true` when credential operations are supported.
 */
export declare function isAvailable(): boolean;
/**
 * Encodes a secret string as UTF-16LE bytes for Windows Credential Manager.
 *
 * @param secret Secret string to encode.
 * @returns The UTF-16LE encoded bytes.
 */
export declare function encodeSecret(secret: string): Uint8Array;
/**
 * Decodes a UTF-16LE credential blob into a string.
 *
 * @param blob Encoded credential bytes.
 * @returns The decoded secret string.
 */
export declare function decodeSecret(blob: Uint8Array): string;
/** Options used when saving a credential. */
export interface WriteOptions {
    targetName: string;
    secret: Uint8Array | string;
    type?: CredType;
    persist?: CredPersist;
    userName?: string;
    comment?: string;
    flags?: CredWriteFlags;
}
/**
 * Saves or updates a credential in Windows Credential Manager.
 *
 * @example Usage
 * ```ts
 * import { saveCredential } from "@neotales/win-cred";
 *
 * saveCredential({ targetName: "myapp/token", secret: "secret" });
 * ```
 *
 * @param options Credential write options.
 */
export declare function saveCredential(options: WriteOptions): void;
/**
 * Reads a credential from Windows Credential Manager.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns The credential when found, otherwise `null`.
 */
export declare function readCredential(targetName: string, type?: CredType): Credential | null;
/**
 * Reads and decodes a credential secret as a string.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns The decoded secret string when found, otherwise `null`.
 */
export declare function readSecret(targetName: string, type?: CredType): string | null;
/**
 * Removes a credential from Windows Credential Manager.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns `true` when a credential was removed.
 */
export declare function removeCredential(targetName: string, type?: CredType): boolean;
/**
 * Lists credentials available to the current user.
 *
 * @param filter Optional filter string.
 * @param flags Enumeration flags.
 * @returns The matching credentials.
 */
export declare function listCredentials(filter?: string | null, flags?: CredEnumerateFlags): Credential[];
