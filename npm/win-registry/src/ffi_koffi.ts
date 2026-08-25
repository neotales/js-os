/**
 * Node.js FFI backend for Windows Registry operations using Koffi.
 *
 * @module
 * @internal
 */

import type { RegistryBackend } from "./types.js";
import { RegistryError } from "./registry_error.js";
import { ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS } from "./types.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const koffi = require("koffi");
const lib = koffi.load("advapi32.dll");

const RegOpenKeyExW = lib.func(
  "int32 __stdcall RegOpenKeyExW(void *hKey, const char16_t *lpSubKey, uint32 ulOptions, uint32 samDesired, _Out_ void **phkResult)",
);
const RegCreateKeyExW = lib.func(
  "int32 __stdcall RegCreateKeyExW(void *hKey, const char16_t *lpSubKey, uint32 Reserved, void *lpClass, uint32 dwOptions, uint32 samDesired, void *lpSecurityAttributes, _Out_ void **phkResult, _Out_ uint32 *lpdwDisposition)",
);
const RegCloseKey = lib.func("int32 __stdcall RegCloseKey(void *hKey)");
const RegDeleteKeyW = lib.func(
  "int32 __stdcall RegDeleteKeyW(void *hKey, const char16_t *lpSubKey)",
);
const RegDeleteValueW = lib.func(
  "int32 __stdcall RegDeleteValueW(void *hKey, const char16_t *lpValueName)",
);
const RegQueryInfoKeyW = lib.func(
  "int32 __stdcall RegQueryInfoKeyW(void *hKey, void *lpClass, void *lpcchClass, void *lpReserved, _Out_ uint32 *lpcSubKeys, _Out_ uint32 *lpcbMaxSubKeyLen, void *lpcbMaxClassLen, _Out_ uint32 *lpcValues, _Out_ uint32 *lpcbMaxValueNameLen, _Out_ uint32 *lpcbMaxValueLen, void *lpcbSecurityDescriptor, void *lpftLastWriteTime)",
);
const RegEnumKeyExW = lib.func(
  "int32 __stdcall RegEnumKeyExW(void *hKey, uint32 dwIndex, char16_t *lpName, _Inout_ uint32 *lpcchName, void *lpReserved, void *lpClass, void *lpcchClass, void *lpftLastWriteTime)",
);
const RegEnumValueW = lib.func(
  "int32 __stdcall RegEnumValueW(void *hKey, uint32 dwIndex, char16_t *lpValueName, _Inout_ uint32 *lpcchValueName, void *lpReserved, _Out_ uint32 *lpType, void *lpData, _Inout_ uint32 *lpcbData)",
);
const RegQueryValueExW = lib.func(
  "int32 __stdcall RegQueryValueExW(void *hKey, const char16_t *lpValueName, void *lpReserved, _Out_ uint32 *lpType, void *lpData, _Inout_ uint32 *lpcbData)",
);
const RegSetValueExW = lib.func(
  "int32 __stdcall RegSetValueExW(void *hKey, const char16_t *lpValueName, uint32 Reserved, uint32 dwType, void *lpData, uint32 cbData)",
);

/**
 * Converts a registry key handle into a Koffi-compatible pointer value.
 *
 * @param hkey The native registry key handle.
 * @returns The handle encoded as a pointer-sized number.
 */
function toHKEY(hkey: bigint): unknown {
  return Number(hkey & 0xffffffffffffffffn);
}

/**
 * The Koffi implementation of the {@linkcode RegistryBackend} contract, backed
 * by `advapi32.dll`.
 *
 * @example Usage
 * ```ts
 * import { backend } from "@neotales/win-registry/dist/ffi_koffi.js";
 * import { HKEY_CURRENT_USER } from "@neotales/win-registry";
 *
 * const handle = backend.openKey(HKEY_CURRENT_USER, "Software", 0x20019);
 * console.log(handle);
 * backend.closeKey(handle);
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
    const resultArr = [null];
    const status = RegOpenKeyExW(
      toHKEY(hkey),
      subKey,
      0,
      access,
      resultArr,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegOpenKeyExW failed for "${subKey}" with error code ${status}`,
      );
    }

    return BigInt(koffi.address(resultArr[0]));
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
    const handleArr = [null];
    const dispositionArr = [0];
    const status = RegCreateKeyExW(
      toHKEY(hkey),
      subKey,
      0,
      null,
      0,
      access,
      null,
      handleArr,
      dispositionArr,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegCreateKeyExW failed for "${subKey}" with error code ${status}`,
      );
    }

    return {
      handle: BigInt(koffi.address(handleArr[0])),
      created: dispositionArr[0] === 1,
    };
  },
  /**
   * Closes an opened key handle.
   *
   * @param hkey The native handle to close.
   */
  closeKey(hkey) {
    RegCloseKey(toHKEY(hkey));
  },
  /**
   * Deletes a subkey.
   *
   * @param hkey The parent handle.
   * @param subKey The relative subkey path.
   * @returns A Windows status code where `0` means success.
   */
  deleteKey(hkey, subKey) {
    return RegDeleteKeyW(toHKEY(hkey), subKey);
  },
  /**
   * Deletes a value.
   *
   * @param hkey The parent handle.
   * @param valueName The value name to delete.
   * @returns A Windows status code where `0` means success.
   */
  deleteValue(hkey, valueName) {
    return RegDeleteValueW(toHKEY(hkey), valueName);
  },
  /**
   * Queries summary information about a key.
   *
   * @param hkey The native key handle.
   * @returns Counts and size limits for the key's subkeys and values.
   * @throws {Error} If `RegQueryInfoKeyW` fails.
   */
  queryInfoKey(hkey) {
    const subKeyCount = [0];
    const maxSubKeyLen = [0];
    const valueCount = [0];
    const maxValueNameLen = [0];
    const maxValueLen = [0];
    const lastWriteTime = new Uint8Array(8);
    const status = RegQueryInfoKeyW(
      toHKEY(hkey),
      null,
      null,
      null,
      subKeyCount,
      maxSubKeyLen,
      null,
      valueCount,
      maxValueNameLen,
      maxValueLen,
      null,
      lastWriteTime,
    );

    if (status !== ERROR_SUCCESS) {
      throw new RegistryError(
        `RegQueryInfoKeyW failed with error code ${status}`,
      );
    }

    const lo = lastWriteTime[0] |
      (lastWriteTime[1] << 8) |
      (lastWriteTime[2] << 16) |
      (lastWriteTime[3] << 24);

    const hi = lastWriteTime[4] |
      (lastWriteTime[5] << 8) |
      (lastWriteTime[6] << 16) |
      (lastWriteTime[7] << 24);

    return {
      subKeyCount: subKeyCount[0],
      maxSubKeyLength: maxSubKeyLen[0],
      valueCount: valueCount[0],
      maxValueNameLength: maxValueNameLen[0],
      maxValueLength: maxValueLen[0],
      lastWriteTime: Number((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)),
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
    const bufSize = nameBufferSize + 1;
    const nameBuf = new Uint16Array(bufSize);
    const sizeBuf = [bufSize];
    const status = RegEnumKeyExW(
      toHKEY(hkey),
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

    return String.fromCharCode(...nameBuf.subarray(0, sizeBuf[0]));
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
    const bufSize = nameBufferSize + 1;
    const nameBuf = new Uint16Array(bufSize);
    const sizeBuf = [bufSize];
    const typeBuf = [0];
    const status = RegEnumValueW(
      toHKEY(hkey),
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

    return String.fromCharCode(...nameBuf.subarray(0, sizeBuf[0]));
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
    const typeBuf = [0];
    const sizeBuf = [buffer.length];
    let status = RegQueryValueExW(
      toHKEY(hkey),
      valueName,
      null,
      typeBuf,
      buffer,
      sizeBuf,
    );

    if (status === ERROR_MORE_DATA) {
      const needed = sizeBuf[0];
      const bigBuf = new Uint8Array(needed);

      sizeBuf[0] = needed;
      status = RegQueryValueExW(
        toHKEY(hkey),
        valueName,
        null,
        typeBuf,
        bigBuf,
        sizeBuf,
      );

      if (status !== ERROR_SUCCESS) {
        return null;
      }

      return {
        type: typeBuf[0],
        data: bigBuf,
      };
    }

    if (status !== ERROR_SUCCESS) {
      return null;
    }

    return {
      type: typeBuf[0],
      data: buffer.subarray(0, sizeBuf[0]),
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
    const status = RegSetValueExW(
      toHKEY(hkey),
      valueName,
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
