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
if (globals.process?.platform === "linux" && globals.process.getBuiltinModule) {
    try {
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
    catch (error) {
        if (globals.process?.env?.DEBUG === "true") {
            console.debug(error);
        }
    }
}
/**
 * Returns whether a libsecret backend is available in the current runtime.
 *
 * @returns `true` when libsecret operations are supported.
 */
export function isLibsecretAvailable() {
    return isSupported;
}
/** Reads and decodes a stored secret. */
export function readSecret(service, account) {
    const bytes = driver.getSecretBytes(service, account);
    return bytes === null ? null : decoder.decode(bytes);
}
/** Reads a stored secret as raw bytes. */
export function getSecretBytes(service, account) {
    return driver.getSecretBytes(service, account);
}
/** Stores or updates a secret. */
export function saveSecret(service, account, secret) {
    driver.setSecretBytes(service, account, typeof secret === "string" ? encoder.encode(secret) : secret);
}
/** Deletes a secret. */
export function removeSecret(service, account) {
    return driver.deleteSecret(service, account);
}
/** Lists secrets for a service when the backend supports enumeration. */
export function listSecrets(service) {
    if (driver.list === undefined) {
        throw new Error("linux-libsecret list is not supported by this runtime backend");
    }
    return driver.list(service);
}
