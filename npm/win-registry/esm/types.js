/**
 * Shared types, constants, and backend interface for the Windows Registry module.
 *
 * @module
 */
export const Rights = {
    ALL_ACCESS: 0xf003f,
    CREATE_LINK: 0x00020,
    CREATE_SUB_KEY: 0x00004,
    ENUMERATE_SUB_KEYS: 0x00008,
    NOTIFY: 0x00010,
    QUERY_VALUE: 0x00001,
    READ: 0x20019,
    SET_VALUE: 0x00002,
    WOW64_32KEY: 0x00200,
    WOW64_64KEY: 0x00100,
    WRITE: 0x20006,
};
/** Alias of `Rights.READ` for callers that prefer an execute-style name. */
export const EXECUTE = Rights.READ;
/**
 * Windows Registry value-type constants used by `getValue()` and `setValue()`.
 *
 * @example
 * key.setValue("Flag", new Uint8Array([1, 0, 0, 0]), Types.DWORD);
 */
export const Types = {
    NONE: 0,
    SZ: 1,
    EXPAND_SZ: 2,
    BINARY: 3,
    DWORD: 4,
    DWORD_BIG_ENDIAN: 5,
    LINK: 6,
    MULTI_SZ: 7,
    RESOURCE_LIST: 8,
    FULL_RESOURCE_DESCRIPTOR: 9,
    RESOURCE_REQUIREMENTS_LIST: 10,
    QWORD: 11,
};
/** Predefined `HKEY_CLASSES_ROOT` handle. */
export const HKEY_CLASSES_ROOT = 0x80000000n;
/** Predefined `HKEY_CURRENT_USER` handle. */
export const HKEY_CURRENT_USER = 0x80000001n;
/** Predefined `HKEY_LOCAL_MACHINE` handle. */
export const HKEY_LOCAL_MACHINE = 0x80000002n;
/** Predefined `HKEY_USERS` handle. */
export const HKEY_USERS = 0x80000003n;
/** Predefined `HKEY_PERFORMANCE_DATA` handle. */
export const HKEY_PERFORMANCE_DATA = 0x80000004n;
/** Predefined `HKEY_CURRENT_CONFIG` handle. */
export const HKEY_CURRENT_CONFIG = 0x80000005n;
export const ERROR_SUCCESS = 0;
export const ERROR_FILE_NOT_FOUND = 2;
export const ERROR_MORE_DATA = 234;
export const ERROR_NO_MORE_ITEMS = 259;
/**
 * Encodes a string as a null-terminated UTF-16LE buffer.
 *
 * @param str String to encode.
 * @returns A UTF-16LE buffer with a trailing null terminator.
 * @example
 * const data = stringToWide("Theme");
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
 * Decodes a UTF-16LE registry string buffer.
 *
 * @param buffer The UTF-16LE buffer.
 * @param byteLength Optional byte length to decode.
 * @returns The decoded string up to the first null terminator.
 * @example
 * const value = wideToString(stringToWide("Theme"));
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
/**
 * Decodes a UTF-16LE `REG_MULTI_SZ` buffer.
 *
 * @param buffer The UTF-16LE buffer.
 * @param byteLength Optional byte length to decode.
 * @returns The decoded string list.
 * @example
 * const values = wideToMultiString(multiStringToWide(["one", "two"]));
 */
export function wideToMultiString(buffer, byteLength) {
    const result = [];
    const decoder = new TextDecoder("utf-16le");
    const len = byteLength ?? buffer.length;
    let start = 0;
    for (let i = 0; i < len - 1; i += 2) {
        if (buffer[i] === 0 && buffer[i + 1] === 0) {
            if (i === start)
                break;
            result.push(decoder.decode(buffer.subarray(start, i)));
            start = i + 2;
        }
    }
    return result;
}
/**
 * Encodes an array of strings as a null-terminated UTF-16LE `REG_MULTI_SZ`
 * buffer.
 *
 * @param arr Strings to encode.
 * @returns The encoded multi-string buffer.
 * @example
 * const data = multiStringToWide(["one", "two"]);
 */
export function multiStringToWide(arr) {
    if (arr.length === 0) {
        return new Uint8Array([0, 0, 0, 0]);
    }
    let totalChars = 0;
    for (const s of arr) {
        totalChars += s.length + 1;
    }
    totalChars += 1;
    const buf = new Uint8Array(totalChars * 2);
    let offset = 0;
    for (const s of arr) {
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            buf[offset] = code & 0xff;
            buf[offset + 1] = (code >> 8) & 0xff;
            offset += 2;
        }
        buf[offset] = 0;
        buf[offset + 1] = 0;
        offset += 2;
    }
    buf[offset] = 0;
    buf[offset + 1] = 0;
    return buf;
}
/**
 * Parses a registry path into a predefined root handle and subkey path.
 *
 * @example Usage
 * ```ts
 * import { parseRegistryPath } from "@neotales/win-registry/types";
 *
 * const parsed = parseRegistryPath("HKCU\\Software\\MyApp");
 * ```
 *
 * @param path Registry path beginning with a known root such as `HKCU` or `HKEY_LOCAL_MACHINE`.
 * @returns The parsed root handle and subkey.
 * @throws Error If the registry root is unknown.
 */
export function parseRegistryPath(path) {
    const sep = path.indexOf("\\");
    const root = sep === -1 ? path : path.slice(0, sep);
    const subKey = sep === -1 ? "" : path.slice(sep + 1);
    switch (root.toUpperCase()) {
        case "HKEY_CLASSES_ROOT":
        case "HKCR":
            return { hkey: HKEY_CLASSES_ROOT, subKey };
        case "HKEY_CURRENT_USER":
        case "HKCU":
            return { hkey: HKEY_CURRENT_USER, subKey };
        case "HKEY_LOCAL_MACHINE":
        case "HKLM":
            return { hkey: HKEY_LOCAL_MACHINE, subKey };
        case "HKEY_USERS":
        case "HKU":
            return { hkey: HKEY_USERS, subKey };
        case "HKEY_PERFORMANCE_DATA":
        case "HKPD":
            return { hkey: HKEY_PERFORMANCE_DATA, subKey };
        case "HKEY_CURRENT_CONFIG":
        case "HKCC":
            return { hkey: HKEY_CURRENT_CONFIG, subKey };
        default:
            throw new Error(`Unknown registry root key: ${root}`);
    }
}
