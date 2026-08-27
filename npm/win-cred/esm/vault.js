import { WINDOWS } from "./types.js";
import { CredEnumerateFlags, CredPersist, CredType, CredWriteFlags } from "./types.js";
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const targetPrefix = "neotales:win-cred:v1:";
const unavailableBackend = {
    write() {
        if (!WINDOWS)
            return;
        unavailable();
    },
    read() {
        return WINDOWS ? unavailable() : null;
    },
    delete() {
        return WINDOWS ? unavailable() : false;
    },
    enumerate() {
        return WINDOWS ? unavailable() : [];
    },
};
let unavailableReason = "Windows Credential Manager is unavailable in this runtime.";
let backend = unavailableBackend;
let available = false;
if (WINDOWS) {
    try {
        const ffi = await import("./ffi.js");
        backend = ffi.WinCred;
        available = ffi.isAvailable();
    }
    catch (error) {
        unavailableReason = error instanceof Error ? error.message : String(error);
    }
}
function unavailable() {
    throw new Error(unavailableReason);
}
function encodePart(value) {
    const bytes = encoder.encode(value);
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}
function decodePart(value) {
    try {
        const padded = value
            .replaceAll("-", "+")
            .replaceAll("_", "/")
            .padEnd(Math.ceil(value.length / 4) * 4, "=");
        const binary = atob(padded);
        return decoder.decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    }
    catch {
        return null;
    }
}
function targetName(service, account) {
    if (!service || !account)
        throw new RangeError("service and account must not be empty.");
    return `${targetPrefix}${encodePart(service)}:${encodePart(account)}`;
}
function recordFromCredential(credential) {
    if (!credential || typeof credential.targetName !== "string")
        return null;
    if (!credential.targetName.startsWith(targetPrefix))
        return null;
    const [servicePart, accountPart, extra] = credential.targetName
        .slice(targetPrefix.length)
        .split(":");
    if (!servicePart || !accountPart || extra !== undefined)
        return null;
    const service = decodePart(servicePart);
    const account = decodePart(accountPart);
    if (service === null || account === null)
        return null;
    return {
        service,
        account,
        secret: credential.credentialBlob,
    };
}
/**
 * Reports whether a Credential Manager backend is available.
 * @returns `true` when secret operations can run.
 * @example
 * ```ts
 * import { isAvailable } from "@neotales/win-cred";
 *
 * console.log(isAvailable());
 * ```
 */
export function isAvailable() {
    return available;
}
/**
 * Reads an opaque secret as bytes.
 * @param service Service namespace.
 * @param account Account identifier.
 * @returns Secret bytes, or `null` when missing.
 * @throws {RangeError} If service or account is empty.
 * @throws {Error} If Windows FFI is unavailable.
 * @example
 * ```ts
 * import { getSecret } from "@neotales/win-cred";
 *
 * const secret = getSecret("service", "account");
 * ```
 */
export function getSecret(service, account) {
    return backend.read(targetName(service, account), CredType.GENERIC)?.credentialBlob ?? null;
}
/**
 * Reads a UTF-8 secret string.
 * @param service Service namespace.
 * @param account Account identifier.
 * @returns Decoded secret, or `null` when missing.
 * @throws {RangeError} If service or account is empty.
 * @throws {Error} If Windows FFI is unavailable.
 * @example
 * ```ts
 * import { getSecretString } from "@neotales/win-cred";
 *
 * const secret = getSecretString("service", "account");
 * ```
 */
export function getSecretString(service, account) {
    const secret = getSecret(service, account);
    return secret === null ? null : decoder.decode(secret);
}
/**
 * Saves a UTF-8 string or opaque byte secret.
 * @param service Service namespace.
 * @param account Account identifier.
 * @param secret UTF-8 string or bytes to persist.
 * @returns Nothing.
 * @throws {RangeError} If service or account is empty.
 * @throws {Error} If Windows rejects the write or FFI is unavailable.
 * @example
 * ```ts
 * import { saveSecret } from "@neotales/win-cred";
 *
 * saveSecret("service", "account", "secret");
 * ```
 */
export function saveSecret(service, account, secret) {
    const credentialBlob = typeof secret === "string" ? encoder.encode(secret) : secret;
    backend.write({
        flags: 0,
        type: CredType.GENERIC,
        targetName: targetName(service, account),
        comment: "",
        lastWritten: 0n,
        credentialBlobSize: credentialBlob.length,
        credentialBlob,
        persist: CredPersist.LOCAL_MACHINE,
        attributeCount: 0,
        targetAlias: "",
        userName: account,
    }, CredWriteFlags.NONE);
}
/**
 * Lists secrets belonging to a service.
 * @param service Service namespace.
 * @returns Service records with opaque secret bytes.
 * @throws {RangeError} If service is empty.
 * @throws {Error} If Windows FFI is unavailable.
 * @example
 * ```ts
 * import { listSecrets } from "@neotales/win-cred";
 *
 * const secrets = listSecrets("service");
 * ```
 */
export function listSecrets(service) {
    if (!service)
        throw new RangeError("service must not be empty.");
    return backend
        .enumerate(`${targetPrefix}${encodePart(service)}:*`, CredEnumerateFlags.NONE)
        .map(recordFromCredential)
        .filter((record) => record !== null);
}
/**
 * Removes a secret.
 * @param service Service namespace.
 * @param account Account identifier.
 * @returns Whether a stored secret was removed.
 * @throws {RangeError} If service or account is empty.
 * @throws {Error} If Windows FFI is unavailable.
 * @example
 * ```ts
 * import { removeSecret } from "@neotales/win-cred";
 *
 * removeSecret("service", "account");
 * ```
 */
export function removeSecret(service, account) {
    return backend.delete(targetName(service, account), CredType.GENERIC);
}
