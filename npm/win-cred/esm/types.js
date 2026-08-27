/**
 * Shared types, enums, constants and backend interface for the Windows Credential Management module.
 *
 * @module
 */
export var CredType;
(function (CredType) {
    /** Generic application credential. */
    CredType[CredType["GENERIC"] = 1] = "GENERIC";
    /** Domain password credential. */
    CredType[CredType["DOMAIN_PASSWORD"] = 2] = "DOMAIN_PASSWORD";
    /** Domain certificate credential. */
    CredType[CredType["DOMAIN_CERTIFICATE"] = 3] = "DOMAIN_CERTIFICATE";
    /** Domain credential visible to the user. */
    CredType[CredType["DOMAIN_VISIBLE_PASSWORD"] = 4] = "DOMAIN_VISIBLE_PASSWORD";
    /** Generic certificate credential. */
    CredType[CredType["GENERIC_CERTIFICATE"] = 5] = "GENERIC_CERTIFICATE";
    /** Extended domain credential. */
    CredType[CredType["DOMAIN_EXTENDED"] = 6] = "DOMAIN_EXTENDED";
    /** Highest defined standard credential type. */
    CredType[CredType["MAXIMUM"] = 7] = "MAXIMUM";
    /** Reserved range beginning after standard types. */
    CredType[CredType["MAXIMUM_EX"] = 1007] = "MAXIMUM_EX";
})(CredType || (CredType = {}));
/** Credential persistence options. */
export var CredPersist;
(function (CredPersist) {
    /** Retain the credential for the current logon session only. */
    CredPersist[CredPersist["SESSION"] = 1] = "SESSION";
    /** Retain the credential on the local computer. */
    CredPersist[CredPersist["LOCAL_MACHINE"] = 2] = "LOCAL_MACHINE";
    /** Retain the credential for the user across domain computers. */
    CredPersist[CredPersist["ENTERPRISE"] = 3] = "ENTERPRISE";
})(CredPersist || (CredPersist = {}));
/** Flags accepted by credential write operations. */
export var CredWriteFlags;
(function (CredWriteFlags) {
    /** Write all supplied fields. */
    CredWriteFlags[CredWriteFlags["NONE"] = 0] = "NONE";
    /** Preserve the existing credential blob. */
    CredWriteFlags[CredWriteFlags["PRESERVE_CREDENTIAL_BLOB"] = 1] = "PRESERVE_CREDENTIAL_BLOB";
})(CredWriteFlags || (CredWriteFlags = {}));
/** Flags accepted by credential enumeration operations. */
export var CredEnumerateFlags;
(function (CredEnumerateFlags) {
    /** Interpret the filter as a target-name pattern. */
    CredEnumerateFlags[CredEnumerateFlags["NONE"] = 0] = "NONE";
    /** Enumerate every credential, ignoring the filter. */
    CredEnumerateFlags[CredEnumerateFlags["ALL_CREDENTIALS"] = 1] = "ALL_CREDENTIALS";
})(CredEnumerateFlags || (CredEnumerateFlags = {}));
/** Whether the current runtime is Windows. */
const runtime = globalThis;
export const WINDOWS = runtime.Deno?.build.os === "windows" ||
    runtime.process?.platform === "win32";
/**
 * Encodes a string as a null-terminated UTF-16LE buffer.
 *
 * @param str String to encode.
 * @returns The encoded UTF-16LE buffer.
 */
export function stringToWide(str) {
    const buf = new Uint8Array((str.length + 1) * 2);
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        buf[i * 2] = code & 0xff;
        buf[i * 2 + 1] = (code >> 8) & 0xff;
    }
    return buf;
}
/**
 * Decodes a UTF-16LE buffer up to the first null terminator.
 *
 * @param buffer Encoded UTF-16LE buffer.
 * @param byteLength Optional byte length to decode.
 * @returns The decoded string.
 */
export function wideToString(buffer, byteLength) {
    const len = byteLength ?? buffer.length;
    const decoder = new TextDecoder("utf-16le");
    let end = len;
    for (let i = 0; i < len - 1; i += 2) {
        if (buffer[i] === 0 && buffer[i + 1] === 0) {
            end = i;
            break;
        }
    }
    return decoder.decode(buffer.subarray(0, end));
}
