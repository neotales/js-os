/**
 * darwin-keychain vault module.
 *
 * @module @neotales/darwin-keychain
 */
/**
 * Returns whether a macOS keychain backend is available in the current runtime.
 *
 * @returns `true` when generic password operations are supported.
 * @example
 * import { isDarwinKeychainAvailable } from "@neotales/darwin-keychain";
 *
 * if (isDarwinKeychainAvailable())
 *   console.log("Keychain is available");
 */
export declare function isDarwinKeychainAvailable(): boolean;
/**
 * Reads and decodes a stored secret.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret string, or `null` when missing.
 * @example
 * import { readSecret } from "@neotales/darwin-keychain";
 *
 * const secret = readSecret("service", "account");
 */
export declare function readSecret(service: string, account: string): string | null;
/**
 * Reads a stored secret as raw bytes.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret bytes, or `null` when missing.
 * @example
 * import { getSecretBytes } from "@neotales/darwin-keychain";
 *
 * const bytes = getSecretBytes("service", "account");
 */
export declare function getSecretBytes(service: string, account: string): Uint8Array | null;
/**
 * Stores or updates a generic password record.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @param secret Secret string or bytes.
 * @returns Nothing.
 * @example
 * import { saveSecret } from "@neotales/darwin-keychain";
 *
 * saveSecret("service", "account", "secret");
 */
export declare function saveSecret(service: string, account: string, secret: string | Uint8Array): void;
/**
 * Deletes a generic password record.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns `true` when a record was deleted.
 * @example
 * import { removeSecret } from "@neotales/darwin-keychain";
 *
 * removeSecret("service", "account");
 */
export declare function removeSecret(service: string, account: string): boolean;
/**
 * Lists records for a service when the backend supports enumeration.
 *
 * Bun currently does not support keychain listing here because the FFI-based
 * implementation panics while enumerating Security.framework results.
 *
 * @param service Keychain service name.
 * @returns Decoded records for the given service.
 * @example
 * import { listSecrets } from "@neotales/darwin-keychain";
 *
 * const records = listSecrets("service");
 */
export declare function listSecrets(service: string): Array<{
    service: string;
    account: string;
    secret: string;
}>;
