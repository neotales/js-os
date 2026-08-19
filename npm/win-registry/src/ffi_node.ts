import type { RegistryBackend } from "./types.js";
import {
  ERROR_MORE_DATA,
  ERROR_NO_MORE_ITEMS,
  ERROR_SUCCESS,
  stringToWide,
  wideToString,
} from "./types.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffi = require("node:ffi");

const lib = ffi.dlopen("advapi32.dll", {
  RegOpenKeyExW: { arguments: ["pointer", "pointer", "u32", "u32", "pointer"], return: "i32" },
  RegCreateKeyExW: {
    arguments: [
      "pointer",
      "pointer",
      "u32",
      "pointer",
      "u32",
      "u32",
      "pointer",
      "pointer",
      "pointer",
    ],
    return: "i32",
  },
  RegCloseKey: { arguments: ["pointer"], return: "i32" },
  RegDeleteKeyW: { arguments: ["pointer", "pointer"], return: "i32" },
  RegDeleteValueW: { arguments: ["pointer", "pointer"], return: "i32" },
  RegQueryInfoKeyW: {
    arguments: [
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
      "pointer",
    ],
    return: "i32",
  },
  RegEnumKeyExW: {
    arguments: ["pointer", "u32", "pointer", "pointer", "pointer", "pointer", "pointer", "pointer"],
    return: "i32",
  },
  RegEnumValueW: {
    arguments: ["pointer", "u32", "pointer", "pointer", "pointer", "pointer", "pointer", "pointer"],
    return: "i32",
  },
  RegQueryValueExW: {
    arguments: ["pointer", "pointer", "pointer", "pointer", "pointer", "pointer"],
    return: "i32",
  },
  RegSetValueExW: {
    arguments: ["pointer", "pointer", "u32", "u32", "pointer", "u32"],
    return: "i32",
  },
});

function readU32(buf: Uint8Array, offset = 0): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(offset, true);
}
function writeU32(buf: Uint8Array, value: number, offset = 0): void {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint32(offset, value, true);
}
function readU64(buf: Uint8Array, offset = 0): bigint {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getBigUint64(offset, true);
}

export const backend: RegistryBackend = {
  openKey(hkey, subKey, access) {
    const wSubKey = stringToWide(subKey);
    const resultBuf = new Uint8Array(8);
    const status = lib.functions.RegOpenKeyExW(hkey, wSubKey, 0, access, resultBuf);
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegOpenKeyExW failed for "${subKey}" with error code ${status}`);
    return readU64(resultBuf);
  },
  createKey(hkey, subKey, access) {
    const wSubKey = stringToWide(subKey);
    const handleBuf = new Uint8Array(8);
    const dispositionBuf = new Uint8Array(4);
    const status = lib.functions.RegCreateKeyExW(
      hkey,
      wSubKey,
      0,
      null,
      0,
      access,
      null,
      handleBuf,
      dispositionBuf,
    );
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegCreateKeyExW failed for "${subKey}" with error code ${status}`);
    return { handle: readU64(handleBuf), created: readU32(dispositionBuf) === 1 };
  },
  closeKey(hkey) {
    lib.functions.RegCloseKey(hkey);
  },
  deleteKey(hkey, subKey) {
    return lib.functions.RegDeleteKeyW(hkey, stringToWide(subKey));
  },
  deleteValue(hkey, valueName) {
    return lib.functions.RegDeleteValueW(hkey, stringToWide(valueName));
  },
  queryInfoKey(hkey) {
    const subKeyCountBuf = new Uint8Array(4);
    const maxSubKeyLenBuf = new Uint8Array(4);
    const valueCountBuf = new Uint8Array(4);
    const maxValueNameLenBuf = new Uint8Array(4);
    const maxValueLenBuf = new Uint8Array(4);
    const lastWriteTimeBuf = new Uint8Array(8);
    const status = lib.functions.RegQueryInfoKeyW(
      hkey,
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
    const status = lib.functions.RegEnumKeyExW(
      hkey,
      index,
      nameBuf,
      sizeBuf,
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
    const status = lib.functions.RegEnumValueW(
      hkey,
      index,
      nameBuf,
      sizeBuf,
      null,
      typeBuf,
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
    let status = lib.functions.RegQueryValueExW(hkey, wName, null, typeBuf, buffer, sizeBuf);
    if (status === ERROR_MORE_DATA) {
      const needed = readU32(sizeBuf);
      const bigBuf = new Uint8Array(needed);
      writeU32(sizeBuf, needed);
      status = lib.functions.RegQueryValueExW(hkey, wName, null, typeBuf, bigBuf, sizeBuf);
      if (status !== ERROR_SUCCESS) return null;
      buffer.set(bigBuf.subarray(0, Math.min(buffer.length, needed)));
      return { type: readU32(typeBuf), bytesRead: needed };
    }
    if (status !== ERROR_SUCCESS) return null;
    return { type: readU32(typeBuf), bytesRead: readU32(sizeBuf) };
  },
  setValue(hkey, valueName, type, data) {
    const status = lib.functions.RegSetValueExW(
      hkey,
      stringToWide(valueName),
      0,
      type,
      data,
      data.length,
    );
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegSetValueExW failed with error code ${status}`);
  },
};
