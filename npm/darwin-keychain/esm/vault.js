/**
 * darwin-keychain vault module.
 *
 * @module @neotales/darwin-keychain
 */
import { DarwinKeychain, isAvailable as isNativeAvailable } from "./ffi.js";
import { DARWIN } from "./types.js";
const decoder = new TextDecoder();
const encoder = new TextEncoder();
function validatePart(name, value) {
    if (!value)
        throw new RangeError(`${name} must not be empty.`);
}
/**
 * Returns whether a macOS keychain backend is available in the current runtime.
 *
 * @returns `true` when generic password operations are supported.
 * @example
 * import { isAvailable } from "@neotales/darwin-keychain";
 *
 * if (isAvailable())
 *   console.log("Keychain is available");
 */
export function isAvailable() {
    return isNativeAvailable();
}
/**
 * Reads a stored secret as raw bytes.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret string, or `null` when missing.
 * @example
 * import { getSecret } from "@neotales/darwin-keychain";
 *
 * const secret = getSecret("service", "account");
 */
export function getSecret(service, account) {
    validatePart("service", service);
    validatePart("account", account);
    if (!DARWIN)
        return null;
    return DarwinKeychain.getSecretBytes(service, account);
}
/**
 * Reads and decodes a stored secret.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret bytes, or `null` when missing.
 * @example
 * import { getSecretString } from "@neotales/darwin-keychain";
 *
 * const secret = getSecretString("service", "account");
 */
export function getSecretString(service, account) {
    const secret = getSecret(service, account);
    return secret === null ? null : decoder.decode(secret);
}
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
export function saveSecret(service, account, secret) {
    validatePart("service", service);
    validatePart("account", account);
    if (!DARWIN)
        return;
    DarwinKeychain.saveSecretBytes(service, account, typeof secret === "string" ? encoder.encode(secret) : secret);
}
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
export function removeSecret(service, account) {
    validatePart("service", service);
    validatePart("account", account);
    if (!DARWIN)
        return false;
    return DarwinKeychain.removeSecret(service, account);
}
/**
 * Lists records for a service when the backend supports enumeration.
 *
 * @param service Keychain service name.
 * @returns Decoded records for the given service.
 * @example
 * import { listSecrets } from "@neotales/darwin-keychain";
 *
 * const records = listSecrets("service");
 */
export function listSecrets(service) {
    validatePart("service", service);
    if (!DARWIN)
        return [];
    return DarwinKeychain.listSecrets(service);
}
