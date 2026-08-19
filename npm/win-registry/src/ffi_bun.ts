/**
 * Bun FFI backend for Windows Registry operations.
 *
 * @module
 * @internal
 */

import type { RegistryBackend } from "./types.js";
import {
  ERROR_MORE_DATA,
  ERROR_NO_MORE_ITEMS,
  ERROR_SUCCESS,
  stringToWide,
  wideToString,
} from "./types.js";
import { dlopen, type Pointer, ptr } from "bun:ffi";

const lib = dlopen("advapi32.dll", {
  RegOpenKeyExW: { args: ["ptr", "ptr", "u32", "u32", "ptr"], returns: "i32" },
  RegCreateKeyExW: {
    args: ["ptr", "ptr", "u32", "ptr", "u32", "u32", "ptr", "ptr", "ptr"],
    returns: "i32",
  },
  RegCloseKey: { args: ["ptr"], returns: "i32" },
  RegDeleteKeyW: { args: ["ptr", "ptr"], returns: "i32" },
  RegDeleteValueW: { args: ["ptr", "ptr"], returns: "i32" },
  RegQueryInfoKeyW: {
    args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
    returns: "i32",
  },
  RegEnumKeyExW: { args: ["ptr", "u32", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"], returns: "i32" },
  RegEnumValueW: { args: ["ptr", "u32", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"], returns: "i32" },
  RegQueryValueExW: { args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr"], returns: "i32" },
  RegSetValueExW: { args: ["ptr", "ptr", "u32", "u32", "ptr", "u32"], returns: "i32" },
});

const { symbols } = lib;

function hkeyToPtr(hkey: bigint): number {
  return Number(hkey);
}
function readU32(buf: Uint8Array, offset = 0): number {
  return (
    (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0
  );
}
function writeU32(buf: Uint8Array, value: number, offset = 0): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}
function readU64(buf: Uint8Array, offset = 0): bigint {
  const lo = BigInt(readU32(buf, offset));
  const hi = BigInt(readU32(buf, offset + 4));
  return (hi << 32n) | lo;
}

export const backend: RegistryBackend = {
  openKey(hkey, subKey, access) {
    const wSubKey = stringToWide(subKey);
    const resultBuf = new Uint8Array(8);
    const status = symbols.RegOpenKeyExW(hkeyToPtr(hkey), ptr(wSubKey), 0, access, ptr(resultBuf));
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegOpenKeyExW failed for "${subKey}" with error code ${status}`);
    return readU64(resultBuf);
  },
  createKey(hkey, subKey, access) {
    const wSubKey = stringToWide(subKey);
    const handleBuf = new Uint8Array(8);
    const dispositionBuf = new Uint8Array(4);
    const status = symbols.RegCreateKeyExW(
      hkeyToPtr(hkey),
      ptr(wSubKey),
      0,
      null,
      0,
      access,
      null,
      ptr(handleBuf),
      ptr(dispositionBuf),
    );
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegCreateKeyExW failed for "${subKey}" with error code ${status}`);
    return { handle: readU64(handleBuf), created: readU32(dispositionBuf) === 1 };
  },
  closeKey(hkey) {
    symbols.RegCloseKey(hkeyToPtr(hkey) as Pointer);
  },
  deleteKey(hkey, subKey) {
    return symbols.RegDeleteKeyW(hkeyToPtr(hkey) as Pointer, ptr(stringToWide(subKey)));
  },
  deleteValue(hkey, valueName) {
    return symbols.RegDeleteValueW(hkeyToPtr(hkey) as Pointer, ptr(stringToWide(valueName)));
  },
  queryInfoKey(hkey) {
    const subKeyCountBuf = new Uint8Array(4);
    const maxSubKeyLenBuf = new Uint8Array(4);
    const valueCountBuf = new Uint8Array(4);
    const maxValueNameLenBuf = new Uint8Array(4);
    const maxValueLenBuf = new Uint8Array(4);
    const lastWriteTimeBuf = new Uint8Array(8);
    const status = symbols.RegQueryInfoKeyW(
      hkeyToPtr(hkey) as Pointer,
      null,
      null,
      null,
      ptr(subKeyCountBuf),
      ptr(maxSubKeyLenBuf),
      null,
      ptr(valueCountBuf),
      ptr(maxValueNameLenBuf),
      ptr(maxValueLenBuf),
      null,
      ptr(lastWriteTimeBuf),
    );
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegQueryInfoKeyW failed with error code ${status}`);
    return {
      subKeyCount: readU32(subKeyCountBuf),
      maxSubKeyLength: readU32(maxSubKeyLenBuf),
      valueCount: readU32(valueCountBuf),
      maxValueNameLength: readU32(maxValueNameLenBuf),
      maxValueLength: readU32(maxValueLenBuf),
      lastWriteTime: Number(readU64(lastWriteTimeBuf)),
    };
  },
  enumKeyNames(hkey, index, nameBufferSize) {
    const nameBuf = new Uint8Array((nameBufferSize + 1) * 2);
    const sizeBuf = new Uint8Array(4);
    writeU32(sizeBuf, nameBufferSize + 1);
    const status = symbols.RegEnumKeyExW(
      hkeyToPtr(hkey) as Pointer,
      index,
      ptr(nameBuf),
      ptr(sizeBuf),
      null,
      null,
      null,
      null,
    );
    if (status === ERROR_NO_MORE_ITEMS) return null;
    if (status !== ERROR_SUCCESS) throw new Error(`RegEnumKeyExW failed with error code ${status}`);
    return wideToString(nameBuf, readU32(sizeBuf) * 2);
  },
  enumValueNames(hkey, index, nameBufferSize) {
    const nameBuf = new Uint8Array((nameBufferSize + 1) * 2);
    const sizeBuf = new Uint8Array(4);
    writeU32(sizeBuf, nameBufferSize + 1);
    const typeBuf = new Uint8Array(4);
    const status = symbols.RegEnumValueW(
      hkeyToPtr(hkey) as Pointer,
      index,
      ptr(nameBuf),
      ptr(sizeBuf),
      null,
      ptr(typeBuf),
      null,
      null,
    );
    if (status === ERROR_NO_MORE_ITEMS) return null;
    if (status !== ERROR_SUCCESS) throw new Error(`RegEnumValueW failed with error code ${status}`);
    return wideToString(nameBuf, readU32(sizeBuf) * 2);
  },
  queryValue(hkey, valueName, buffer) {
    const wName = stringToWide(valueName);
    const typeBuf = new Uint8Array(4);
    const sizeBuf = new Uint8Array(4);
    writeU32(sizeBuf, buffer.length);
    let status = symbols.RegQueryValueExW(
      hkeyToPtr(hkey) as Pointer,
      ptr(wName),
      null,
      ptr(typeBuf),
      ptr(buffer),
      ptr(sizeBuf),
    );
    if (status === ERROR_MORE_DATA) {
      const needed = readU32(sizeBuf);
      const bigBuf = new Uint8Array(needed);
      writeU32(sizeBuf, needed);
      status = symbols.RegQueryValueExW(
        hkeyToPtr(hkey) as Pointer,
        ptr(wName),
        null,
        ptr(typeBuf),
        ptr(bigBuf),
        ptr(sizeBuf),
      );
      if (status !== ERROR_SUCCESS) return null;
      buffer.set(bigBuf.subarray(0, Math.min(buffer.length, needed)));
      return { type: readU32(typeBuf), bytesRead: needed };
    }
    if (status !== ERROR_SUCCESS) return null;
    return { type: readU32(typeBuf), bytesRead: readU32(sizeBuf) };
  },
  setValue(hkey, valueName, type, data) {
    const status = symbols.RegSetValueExW(
      hkeyToPtr(hkey) as Pointer,
      ptr(stringToWide(valueName)),
      0,
      type,
      ptr(data),
      data.length,
    );
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegSetValueExW failed with error code ${status}`);
  },
};
