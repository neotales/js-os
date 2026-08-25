/**
 * Bun FFI backend for Windows Registry operations.
 *
 * Loads `advapi32.dll` through `bun:ffi`. Because opening the library is a
 * side effectful operation, the backend exposes an explicit lifecycle:
 * {@linkcode open} eagerly opens `advapi32.dll`, {@linkcode close} unloads it
 * again, and {@linkcode isOpened} reports the current state. The library also
 * loads lazily on the first backend call when {@linkcode open} was never used.
 *
 * @module
 * @internal
 */
import { RegistryError } from "./registry_error.js";
import { readU32, readU64, writeU32 } from "./binary.js";
import { ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS, stringToWide, wideToString, } from "./types.js";
import { dlopen, ptr } from "bun:ffi";
let library = null;
/**
 * The `advapi32.dll` symbol table requested from `bun:ffi`.
 */
const SYMBOLS = {
    RegOpenKeyExW: { args: ["ptr", "ptr", "u32", "u32", "ptr"], returns: "i32" },
    RegCreateKeyExW: {
        args: ["ptr", "ptr", "u32", "ptr", "u32", "u32", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    RegCloseKey: { args: ["ptr"], returns: "i32" },
    RegDeleteKeyW: { args: ["ptr", "ptr"], returns: "i32" },
    RegDeleteValueW: { args: ["ptr", "ptr"], returns: "i32" },
    RegQueryInfoKeyW: {
        args: [
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
            "ptr",
        ],
        returns: "i32",
    },
    RegEnumKeyExW: {
        args: ["ptr", "u32", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    RegEnumValueW: {
        args: ["ptr", "u32", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    RegQueryValueExW: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    RegSetValueExW: {
        args: ["ptr", "ptr", "u32", "u32", "ptr", "u32"],
        returns: "i32",
    },
};
/**
 * Opens `advapi32.dll` exactly once, reusing the opened library on subsequent
 * calls.
 *
 * @returns The opened Bun FFI library.
 * @throws {Error} If `advapi32.dll` cannot be opened.
 */
function ensureLoaded() {
    if (library) {
        return library;
    }
    library = dlopen("advapi32.dll", SYMBOLS);
    return library;
}
/**
 * Returns the resolved FFI entry points, opening `advapi32.dll` if
 * {@linkcode open} has not been called yet.
 *
 * @returns The resolved symbol functions.
 * @throws {Error} If the library cannot be loaded.
 */
function fns() {
    return ensureLoaded().symbols;
}
/**
 * Eagerly opens `advapi32.dll` through `bun:ffi`.
 *
 * Call this at startup to fail fast when the native library is unavailable;
 * otherwise the library loads lazily on the first backend call. Repeated
 * calls are no-ops while the backend stays open.
 *
 * @throws {Error} If the library cannot be loaded.
 *
 * @example Usage
 * ```ts
 * import { open } from "@neotales/win-registry/dist/ffi_bun.js";
 *
 * open();
 * console.log("advapi32.dll is ready");
 * ```
 */
export function open() {
    ensureLoaded();
}
/**
 * Reports whether the backend currently holds an opened native library.
 *
 * @returns `true` after a successful {@linkcode open} or lazy load and before
 * {@linkcode close}.
 *
 * @example Usage
 * ```ts
 * import { isOpened } from "@neotales/win-registry/dist/ffi_bun.js";
 *
 * console.log(isOpened());
 * ```
 */
export function isOpened() {
    return library !== null;
}
/**
 * Unloads `advapi32.dll` so a later {@linkcode open} starts from a clean
 * state. Safe to call when the backend was never opened. Open registry keys
 * must be closed before calling this.
 *
 * @example Usage
 * ```ts
 * import { close } from "@neotales/win-registry/dist/ffi_bun.js";
 *
 * close();
 * ```
 */
export function close() {
    if (!library) {
        return;
    }
    try {
        library.close?.();
    }
    finally {
        library = null;
    }
}
/**
 * Converts a registry key handle into an FFI pointer-sized number.
 *
 * @param hkey The native registry key handle.
 * @returns The handle encoded as a pointer-sized number.
 */
function hkeyToPtr(hkey) {
    return Number(hkey);
}
/**
 * The Bun FFI implementation of the {@linkcode RegistryBackend} contract,
 * backed by `advapi32.dll`. The library opens lazily on the first call; use
 * {@linkcode open}, {@linkcode isOpened}, and {@linkcode close} for explicit
 * control over the native library lifetime.
 *
 * @example Usage
 * ```ts
 * import { backend, close, open } from "@neotales/win-registry/dist/ffi_bun.js";
 * import { HKEY_CURRENT_USER } from "@neotales/win-registry";
 *
 * open();
 * try {
 *   const handle = backend.openKey(HKEY_CURRENT_USER, "Software", 0x20019);
 *   console.log(handle);
 *   backend.closeKey(handle);
 * } finally {
 *   close();
 * }
 * ```
 */
export const backend = {
    /**
     * Opens a subkey of a predefined root handle.
     *
     * @param hkey The predefined root handle.
     * @param subKey The relative subkey path.
     * @param access The requested access rights.
     * @returns The native handle of the opened key.
     * @throws {Error} If `RegOpenKeyExW` fails.
     */
    openKey(hkey, subKey, access) {
        const wSubKey = stringToWide(subKey);
        const resultBuf = new Uint8Array(8);
        const status = fns().RegOpenKeyExW(hkeyToPtr(hkey), ptr(wSubKey), 0, access, ptr(resultBuf));
        if (status !== ERROR_SUCCESS) {
            throw new RegistryError(`RegOpenKeyExW failed for "${subKey}" with error code ${status}`);
        }
        return readU64(resultBuf);
    },
    /**
     * Creates a subkey of a predefined root handle, or opens it when it exists.
     *
     * @param hkey The predefined root handle.
     * @param subKey The relative subkey path.
     * @param access The requested access rights.
     * @returns The native handle and whether the key was newly created.
     * @throws {Error} If `RegCreateKeyExW` fails.
     */
    createKey(hkey, subKey, access) {
        const wSubKey = stringToWide(subKey);
        const handleBuf = new Uint8Array(8);
        const dispositionBuf = new Uint8Array(4);
        const status = fns().RegCreateKeyExW(hkeyToPtr(hkey), ptr(wSubKey), 0, null, 0, access, null, ptr(handleBuf), ptr(dispositionBuf));
        if (status !== ERROR_SUCCESS) {
            throw new RegistryError(`RegCreateKeyExW failed for "${subKey}" with error code ${status}`);
        }
        return {
            handle: readU64(handleBuf),
            created: readU32(dispositionBuf) === 1,
        };
    },
    /**
     * Closes an opened key handle.
     *
     * @param hkey The native handle to close.
     */
    closeKey(hkey) {
        fns().RegCloseKey(hkeyToPtr(hkey));
    },
    /**
     * Deletes a subkey.
     *
     * @param hkey The parent handle.
     * @param subKey The relative subkey path.
     * @returns A Windows status code where `0` means success.
     */
    deleteKey(hkey, subKey) {
        return fns().RegDeleteKeyW(hkeyToPtr(hkey), ptr(stringToWide(subKey)));
    },
    /**
     * Deletes a value.
     *
     * @param hkey The parent handle.
     * @param valueName The value name to delete.
     * @returns A Windows status code where `0` means success.
     */
    deleteValue(hkey, valueName) {
        return fns().RegDeleteValueW(hkeyToPtr(hkey), ptr(stringToWide(valueName)));
    },
    /**
     * Queries summary information about a key.
     *
     * @param hkey The native key handle.
     * @returns Counts and size limits for the key's subkeys and values.
     * @throws {Error} If `RegQueryInfoKeyW` fails.
     */
    queryInfoKey(hkey) {
        const subKeyCountBuf = new Uint8Array(4);
        const maxSubKeyLenBuf = new Uint8Array(4);
        const valueCountBuf = new Uint8Array(4);
        const maxValueNameLenBuf = new Uint8Array(4);
        const maxValueLenBuf = new Uint8Array(4);
        const lastWriteTimeBuf = new Uint8Array(8);
        const status = fns().RegQueryInfoKeyW(hkeyToPtr(hkey), null, null, null, ptr(subKeyCountBuf), ptr(maxSubKeyLenBuf), null, ptr(valueCountBuf), ptr(maxValueNameLenBuf), ptr(maxValueLenBuf), null, ptr(lastWriteTimeBuf));
        if (status !== ERROR_SUCCESS) {
            throw new RegistryError(`RegQueryInfoKeyW failed with error code ${status}`);
        }
        return {
            subKeyCount: readU32(subKeyCountBuf),
            maxSubKeyLength: readU32(maxSubKeyLenBuf),
            valueCount: readU32(valueCountBuf),
            maxValueNameLength: readU32(maxValueNameLenBuf),
            maxValueLength: readU32(maxValueLenBuf),
            lastWriteTime: Number(readU64(lastWriteTimeBuf)),
        };
    },
    /**
     * Enumerates a subkey name by index.
     *
     * @param hkey The native key handle.
     * @param index The zero-based subkey index.
     * @param nameBufferSize The maximum subkey name length in characters.
     * @returns The subkey name, or `null` when no more items exist.
     * @throws {Error} If `RegEnumKeyExW` fails unexpectedly.
     */
    enumKeyNames(hkey, index, nameBufferSize) {
        const nameBuf = new Uint8Array((nameBufferSize + 1) * 2);
        const sizeBuf = new Uint8Array(4);
        writeU32(sizeBuf, nameBufferSize + 1);
        const status = fns().RegEnumKeyExW(hkeyToPtr(hkey), index, ptr(nameBuf), ptr(sizeBuf), null, null, null, null);
        if (status === ERROR_NO_MORE_ITEMS) {
            return null;
        }
        if (status !== ERROR_SUCCESS) {
            throw new RegistryError(`RegEnumKeyExW failed with error code ${status}`);
        }
        return wideToString(nameBuf, readU32(sizeBuf) * 2);
    },
    /**
     * Enumerates a value name by index.
     *
     * @param hkey The native key handle.
     * @param index The zero-based value index.
     * @param nameBufferSize The maximum value name length in characters.
     * @returns The value name, or `null` when no more items exist.
     * @throws {Error} If `RegEnumValueW` fails unexpectedly.
     */
    enumValueNames(hkey, index, nameBufferSize) {
        const nameBuf = new Uint8Array((nameBufferSize + 1) * 2);
        const sizeBuf = new Uint8Array(4);
        writeU32(sizeBuf, nameBufferSize + 1);
        const typeBuf = new Uint8Array(4);
        const status = fns().RegEnumValueW(hkeyToPtr(hkey), index, ptr(nameBuf), ptr(sizeBuf), null, ptr(typeBuf), null, null);
        if (status === ERROR_NO_MORE_ITEMS) {
            return null;
        }
        if (status !== ERROR_SUCCESS) {
            throw new RegistryError(`RegEnumValueW failed with error code ${status}`);
        }
        return wideToString(nameBuf, readU32(sizeBuf) * 2);
    },
    /**
     * Reads a raw value and its type.
     *
     * @param hkey The native key handle.
     * @param valueName The value name to read.
     * @returns The value type and data, or `null` when the value is missing.
     */
    queryValue(hkey, valueName) {
        const buffer = new Uint8Array(4096);
        const wName = stringToWide(valueName);
        const typeBuf = new Uint8Array(4);
        const sizeBuf = new Uint8Array(4);
        writeU32(sizeBuf, buffer.length);
        let status = fns().RegQueryValueExW(hkeyToPtr(hkey), ptr(wName), null, ptr(typeBuf), ptr(buffer), ptr(sizeBuf));
        if (status === ERROR_MORE_DATA) {
            const needed = readU32(sizeBuf);
            const bigBuf = new Uint8Array(needed);
            writeU32(sizeBuf, needed);
            status = fns().RegQueryValueExW(hkeyToPtr(hkey), ptr(wName), null, ptr(typeBuf), ptr(bigBuf), ptr(sizeBuf));
            if (status !== ERROR_SUCCESS) {
                return null;
            }
            return {
                type: readU32(typeBuf),
                data: bigBuf,
            };
        }
        if (status !== ERROR_SUCCESS) {
            return null;
        }
        return {
            type: readU32(typeBuf),
            data: buffer.subarray(0, readU32(sizeBuf)),
        };
    },
    /**
     * Writes a raw value.
     *
     * @param hkey The native key handle.
     * @param valueName The value name to write.
     * @param type The registry value type.
     * @param data The encoded value data.
     * @throws {Error} If `RegSetValueExW` fails.
     */
    setValue(hkey, valueName, type, data) {
        const status = fns().RegSetValueExW(hkeyToPtr(hkey), ptr(stringToWide(valueName)), 0, type, ptr(data), data.length);
        if (status !== ERROR_SUCCESS) {
            throw new RegistryError(`RegSetValueExW failed with error code ${status}`);
        }
    },
};
