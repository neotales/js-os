/**
 * Deno FFI backend for Windows Registry operations.
 *
 * Loads `advapi32.dll` through Deno FFI, which requires the `--allow-ffi`
 * permission flag. Because opening the library is a side effectful operation,
 * the backend exposes an explicit lifecycle: {@linkcode open} eagerly opens
 * `advapi32.dll`, {@linkcode close} unloads it again, and {@linkcode isOpened}
 * reports the current state. The library also loads lazily on the first
 * backend call when {@linkcode open} was never used.
 *
 * @module
 * @internal
 */

import type { RegistryBackend } from "./types.js";
import { RegistryError } from "./registry_error.js";
import { readU32, readU64, writeU32 } from "./binary.js";
import {
  ERROR_MORE_DATA,
  ERROR_NO_MORE_ITEMS,
  ERROR_SUCCESS,
  stringToWide,
  wideToString,
} from "./types.js";

type DenoLike = {
  dlopen: (...args: any[]) => any;
  UnsafePointer: { create(value: bigint): unknown };
};

/** An opened Deno dynamic library with its resolved symbols. */
interface DenoLibrary {
  /** The resolved FFI entry points, keyed by symbol name. */
  symbols: Record<string, (...args: unknown[]) => number>;
  /** Unloads the library. */
  close(): void;
}

let ffiModule: DenoLike | undefined;
let library: DenoLibrary | null = null;

/**
 * Returns the Deno global after verifying the current runtime is Deno.
 *
 * @returns The Deno namespace subset used by this backend.
 * @throws {Error} If not running under Deno.
 */
function getDeno(): DenoLike {
  if (!ffiModule) {
    ffiModule = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno;
  }

  if (!ffiModule) {
    throw new RegistryError("Deno runtime is required for this backend");
  }

  return ffiModule;
}

/**
 * Converts a registry key handle into a Deno FFI pointer.
 *
 * @param value The native registry key handle.
 * @returns The pointer representation used by Deno FFI.
 */
function ptr(value: bigint): unknown {
  return getDeno().UnsafePointer.create(value);
}

/**
 * The `advapi32.dll` symbol table requested from Deno FFI.
 */
const SYMBOLS = {
  RegOpenKeyExW: {
    parameters: ["pointer", "buffer", "u32", "u32", "buffer"],
    result: "i32",
  },
  RegCreateKeyExW: {
    parameters: [
      "pointer",
      "buffer",
      "u32",
      "pointer",
      "u32",
      "u32",
      "pointer",
      "buffer",
      "buffer",
    ],
    result: "i32",
  },
  RegCloseKey: { parameters: ["pointer"], result: "i32" },
  RegDeleteKeyW: { parameters: ["pointer", "buffer"], result: "i32" },
  RegDeleteValueW: { parameters: ["pointer", "buffer"], result: "i32" },
  RegQueryInfoKeyW: {
    parameters: [
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "buffer",
      "buffer",
      "pointer",
      "buffer",
      "buffer",
      "buffer",
      "pointer",
      "buffer",
    ],
    result: "i32",
  },
  RegEnumKeyExW: {
    parameters: [
      "pointer",
      "u32",
      "buffer",
      "buffer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
    ],
    result: "i32",
  },
  RegEnumValueW: {
    parameters: [
      "pointer",
      "u32",
      "buffer",
      "buffer",
      "pointer",
      "buffer",
      "buffer",
      "buffer",
    ],
    result: "i32",
  },
  RegQueryValueExW: {
    parameters: ["pointer", "buffer", "pointer", "buffer", "buffer", "buffer"],
    result: "i32",
  },
  RegSetValueExW: {
    parameters: ["pointer", "buffer", "u32", "u32", "buffer", "u32"],
    result: "i32",
  },
} as const;

/**
 * Opens `advapi32.dll` exactly once, reusing the opened library on subsequent
 * calls.
 *
 * @returns The opened Deno dynamic library.
 * @throws {Error} If not running under Deno or if opening `advapi32.dll`
 * fails, e.g. when the `--allow-ffi` permission flag is missing.
 */
function ensureLoaded(): DenoLibrary {
  if (library) {
    return library;
  }
  try {
    library = getDeno().dlopen(
      "advapi32.dll",
      SYMBOLS,
    ) as unknown as DenoLibrary;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new RegistryError(
      `Failed to open "advapi32.dll" via Deno FFI (requires --allow-ffi): ${reason}`,
      { cause: error },
    );
  }
  return library;
}

/**
 * Returns the resolved FFI entry points, opening `advapi32.dll` if
 * {@linkcode open} has not been called yet.
 *
 * @returns The resolved symbol functions.
 * @throws {Error} If the library cannot be loaded.
 */
function fns(): Record<string, (...args: unknown[]) => number> {
  return ensureLoaded().symbols;
}

/**
 * Eagerly opens `advapi32.dll` through Deno FFI.
 *
 * Call this at startup to fail fast when the `--allow-ffi` permission is
 * missing; otherwise the library loads lazily on the first backend call.
 * Repeated calls are no-ops while the backend stays open.
 *
 * @throws {Error} If the library cannot be loaded.
 *
 * @example Usage
 * ```ts
 * import { open } from "@neotales/win-registry/dist/ffi_deno.js";
 *
 * open();
 * console.log("advapi32.dll is ready");
 * ```
 */
export function open(): void {
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
 * import { isOpened } from "@neotales/win-registry/dist/ffi_deno.js";
 *
 * console.log(isOpened());
 * ```
 */
export function isOpened(): boolean {
  return library !== null;
}

/**
 * Unloads `advapi32.dll` so a later {@linkcode open} starts from a clean
 * state. Safe to call when the backend was never opened. Open registry keys
 * must be closed before calling this.
 *
 * @example Usage
 * ```ts
 * import { close } from "@neotales/win-registry/dist/ffi_deno.js";
 *
 * close();
 * ```
 */
export function close(): void {
  if (!library) {
    return;
  }

  try {
    library.close();
  } finally {
    library = null;
  }
}

/**
 * The Deno FFI implementation of the {@linkcode RegistryBackend} contract,
 * backed by `advapi32.dll`. The library opens lazily on the first call; use
 * {@linkcode open}, {@linkcode isOpened}, and {@linkcode close} for explicit
 * control over the native library lifetime.
 *
 * @example Usage
 * ```ts
 * import { backend, close, open } from "@neotales/win-registry/dist/ffi_deno.js";
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
export const backend: RegistryBackend = {
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
    const status = fns().RegOpenKeyExW(
      ptr(hkey),
      wSubKey,
      0,
      access,
      resultBuf,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegOpenKeyExW failed for "${subKey}" with error code ${status}`,
      );
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
    const status = fns().RegCreateKeyExW(
      ptr(hkey),
      wSubKey,
      0,
      null,
      0,
      access,
      null,
      handleBuf,
      dispositionBuf,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegCreateKeyExW failed for "${subKey}" with error code ${status}`,
      );
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
    fns().RegCloseKey(ptr(hkey));
  },
  /**
   * Deletes a subkey.
   *
   * @param hkey The parent handle.
   * @param subKey The relative subkey path.
   * @returns A Windows status code where `0` means success.
   */
  deleteKey(hkey, subKey) {
    return fns().RegDeleteKeyW(ptr(hkey), stringToWide(subKey));
  },
  /**
   * Deletes a value.
   *
   * @param hkey The parent handle.
   * @param valueName The value name to delete.
   * @returns A Windows status code where `0` means success.
   */
  deleteValue(hkey, valueName) {
    return fns().RegDeleteValueW(ptr(hkey), stringToWide(valueName));
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
    const status = fns().RegQueryInfoKeyW(
      ptr(hkey),
      null,
      null,
      null,
      subKeyCountBuf,
      maxSubKeyLenBuf,
      null,
      valueCountBuf,
      maxValueNameLenBuf,
      maxValueLenBuf,
      null,
      lastWriteTimeBuf,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegQueryInfoKeyW failed with error code ${status}`,
      );
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

    const status = fns().RegEnumKeyExW(
      ptr(hkey),
      index,
      nameBuf,
      sizeBuf,
      null,
      null,
      null,
      null,
    );

    if (status === ERROR_NO_MORE_ITEMS) {
      return null;
    }

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(`RegEnumKeyExW failed with error code ${status}`);
    }

    return wideToString(nameBuf, readU32(sizeBuf) * 2);
  },
  enumValueNames(hkey, index, nameBufferSize) {
    const nameBuf = new Uint8Array((nameBufferSize + 1) * 2);
    const sizeBuf = new Uint8Array(4);

    writeU32(sizeBuf, nameBufferSize + 1);

    const typeBuf = new Uint8Array(4);
    const status = fns().RegEnumValueW(
      ptr(hkey),
      index,
      nameBuf,
      sizeBuf,
      null,
      typeBuf,
      null,
      null,
    );

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

    let status = fns().RegQueryValueExW(
      ptr(hkey),
      wName,
      null,
      typeBuf,
      buffer,
      sizeBuf,
    );

    if (status === ERROR_MORE_DATA) {
      const needed = readU32(sizeBuf);
      const bigBuf = new Uint8Array(needed);

      writeU32(sizeBuf, needed);

      status = fns().RegQueryValueExW(
        ptr(hkey),
        wName,
        null,
        typeBuf,
        bigBuf,
        sizeBuf,
      );

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
    const status = fns().RegSetValueExW(
      ptr(hkey),
      stringToWide(valueName),
      0,
      type,
      data,
      data.length,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegSetValueExW failed with error code ${status}`,
      );
    }
  },
};
