/**
 * darwin-keychain vault module.
 *
 * @module @neotales/darwin-keychain
 */
const globals = globalThis;
const decoder = new TextDecoder();
const encoder = new TextEncoder();
let isSupported = false;
let driver = {
    getSecretBytes(_service, _account) {
        return null;
    },
    setSecretBytes(_service, _account, _secret) {
        return;
    },
    deleteSecret(_service, _account) {
        return false;
    },
};
if (globals.process?.platform === "darwin" && globals.process.getBuiltinModule) {
    const { createRequire } = globals.process.getBuiltinModule("node:module");
    const require = createRequire(import.meta.url);
    if (typeof globals.Deno !== "undefined") {
        driver = require("./ffi_deno.js").backend;
        isSupported = true;
    }
    else if (typeof globals.Bun !== "undefined") {
        driver = require("./ffi_bun.js").backend;
        isSupported = true;
    }
    else {
        try {
            if (globals.process.getBuiltinModule("node:ffi")) {
                driver = require("./ffi_node.js").backend;
                isSupported = true;
            }
            else {
                driver = require("./ffi_koffi.js").backend;
                isSupported = true;
            }
        }
        catch (error) {
            if (globals.process.env?.DEBUG === "true") {
                console.debug(error);
            }
        }
    }
}
/**
 * Returns whether a macOS keychain backend is available in the current runtime.
 *
 * @returns `true` when generic password operations are supported.
 * @example
 * if (isDarwinKeychainAvailable()) console.log("Keychain is available");
 */
export function isDarwinKeychainAvailable() {
    return isSupported;
}
/**
 * Reads and decodes a stored secret.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret string, or `null` when missing.
 * @example
 * const secret = readSecret("service", "account");
 */
export function readSecret(service, account) {
    const bytes = driver.getSecretBytes(service, account);
    return bytes === null ? null : decoder.decode(bytes);
}
/**
 * Reads a stored secret as raw bytes.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret bytes, or `null` when missing.
 * @example
 * const bytes = getSecretBytes("service", "account");
 */
export function getSecretBytes(service, account) {
    return driver.getSecretBytes(service, account);
}
/**
 * Stores or updates a generic password record.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @param secret Secret string or bytes.
 * @returns Nothing.
 * @example
 * saveSecret("service", "account", "secret");
 */
export function saveSecret(service, account, secret) {
    driver.setSecretBytes(service, account, typeof secret === "string" ? encoder.encode(secret) : secret);
}
/**
 * Deletes a generic password record.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns `true` when a record was deleted.
 * @example
 * removeSecret("service", "account");
 */
export function removeSecret(service, account) {
    return driver.deleteSecret(service, account);
}
/**
 * Lists records for a service when the backend supports enumeration.
 *
 * Bun currently does not support keychain listing here because the FFI-based
 * implementation panics while enumerating Security.framework results.
 *
 * @param service Keychain service name.
 * @returns Decoded records for the given service.
 * @example
 * const records = listSecrets("service");
 */
export function listSecrets(service) {
    if (driver.list === undefined) {
        throw new Error("darwin-keychain list is not supported in Bun right now because it triggers a Bun panic; other unsupported runtimes also omit list support");
    }
    const records = driver.list(service);
    return records.map((record) => ({
        service: record.service,
        account: record.account,
        secret: decoder.decode(record.secret),
    }));
}
