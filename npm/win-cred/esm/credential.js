import { CredEnumerateFlags, CredPersist, CredType, CredWriteFlags } from "./types.js";
const globals = globalThis;
let isSupported = false;
let driver = {
    write(_cred, _flags) {
        return;
    },
    read(_targetName, _type) {
        return null;
    },
    delete(_targetName, _type) {
        return false;
    },
    enumerate(_filter, _flags) {
        return [];
    },
};
if (globals.process?.platform === "win32" && globals.process.getBuiltinModule) {
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
function rawToCredential(raw) {
    return {
        targetName: raw.targetName,
        type: raw.type,
        comment: raw.comment,
        credentialBlob: raw.credentialBlob,
        persist: raw.persist,
        targetAlias: raw.targetAlias,
        userName: raw.userName,
        lastWritten: raw.lastWritten,
        flags: raw.flags,
        attributeCount: raw.attributeCount,
    };
}
/**
 * Returns whether a Windows Credential Manager backend is available in the
 * current runtime.
 *
 * @returns `true` when credential operations are supported.
 */
export function isAvailable() {
    return isSupported;
}
/**
 * Encodes a secret string as UTF-16LE bytes for Windows Credential Manager.
 *
 * @param secret Secret string to encode.
 * @returns The UTF-16LE encoded bytes.
 */
export function encodeSecret(secret) {
    const buf = new Uint8Array(secret.length * 2);
    for (let i = 0; i < secret.length; i++) {
        const code = secret.charCodeAt(i);
        buf[i * 2] = code & 0xff;
        buf[i * 2 + 1] = (code >> 8) & 0xff;
    }
    return buf;
}
/**
 * Decodes a UTF-16LE credential blob into a string.
 *
 * @param blob Encoded credential bytes.
 * @returns The decoded secret string.
 */
export function decodeSecret(blob) {
    const decoder = new TextDecoder("utf-16le");
    return decoder.decode(blob);
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
export function saveCredential(options) {
    const blob = typeof options.secret === "string" ? encodeSecret(options.secret) : options.secret;
    driver.write({
        flags: 0,
        type: options.type ?? CredType.GENERIC,
        targetName: options.targetName,
        comment: options.comment ?? "",
        lastWritten: 0n,
        credentialBlobSize: blob.length,
        credentialBlob: blob,
        persist: options.persist ?? CredPersist.LOCAL_MACHINE,
        attributeCount: 0,
        targetAlias: "",
        userName: options.userName ?? "",
    }, options.flags ?? CredWriteFlags.NONE);
}
/**
 * Reads a credential from Windows Credential Manager.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns The credential when found, otherwise `null`.
 */
export function readCredential(targetName, type = CredType.GENERIC) {
    const raw = driver.read(targetName, type);
    return raw ? rawToCredential(raw) : null;
}
/**
 * Reads and decodes a credential secret as a string.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns The decoded secret string when found, otherwise `null`.
 */
export function readSecret(targetName, type = CredType.GENERIC) {
    const cred = readCredential(targetName, type);
    return cred ? decodeSecret(cred.credentialBlob) : null;
}
/**
 * Removes a credential from Windows Credential Manager.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns `true` when a credential was removed.
 */
export function removeCredential(targetName, type = CredType.GENERIC) {
    return driver.delete(targetName, type);
}
/**
 * Lists credentials available to the current user.
 *
 * @param filter Optional filter string.
 * @param flags Enumeration flags.
 * @returns The matching credentials.
 */
export function listCredentials(filter, flags = CredEnumerateFlags.NONE) {
    return driver.enumerate(filter ?? null, flags).map(rawToCredential);
}
