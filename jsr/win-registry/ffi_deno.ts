/**
 * Deno FFI backend for Windows Registry operations.
 *
 * @module
 * @internal
 */

import type { RegistryBackend } from "./types.ts";
import {
  ERROR_MORE_DATA,
  ERROR_NO_MORE_ITEMS,
  ERROR_SUCCESS,
  stringToWide,
  wideToString,
} from "./types.ts";

type DenoLike = {
  dlopen: (...args: any[]) => any;
  UnsafePointer: { create(value: bigint): unknown };
};

const Deno = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno;

if (!Deno) {
  throw new Error("Deno runtime is required for this backend");
}

const lib = Deno.dlopen("advapi32.dll", {
  RegOpenKeyExW: { parameters: ["pointer", "buffer", "u32", "u32", "buffer"], result: "i32" },
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
    parameters: ["pointer", "u32", "buffer", "buffer", "pointer", "pointer", "pointer", "pointer"],
    result: "i32",
  },
  RegEnumValueW: {
    parameters: ["pointer", "u32", "buffer", "buffer", "pointer", "buffer", "buffer", "buffer"],
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
} as const);

const { symbols } = lib;

function readU32(buf: Uint8Array, offset = 0): number {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}

function writeU32(buf: Uint8Array, value: number, offset = 0): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

function readU64(buf: Uint8Array, offset = 0): bigint {
  const lo = BigInt(readU32(buf, offset) >>> 0);
  const hi = BigInt(readU32(buf, offset + 4) >>> 0);
  return (hi << 32n) | lo;
}

export const backend: RegistryBackend = {
  openKey(hkey, subKey, access) {
    const wSubKey = stringToWide(subKey);
    const resultBuf = new Uint8Array(8);
    const status = symbols.RegOpenKeyExW(
      Deno.UnsafePointer.create(hkey),
      wSubKey,
      0,
      access,
      resultBuf,
    );
    if (status !== ERROR_SUCCESS)
      throw new Error(`RegOpenKeyExW failed for "${subKey}" with error code ${status}`);
    return readU64(resultBuf);
  },
  createKey(hkey, subKey, access) {
    const wSubKey = stringToWide(subKey);
    const handleBuf = new Uint8Array(8);
    const dispositionBuf = new Uint8Array(4);
    const status = symbols.RegCreateKeyExW(
      Deno.UnsafePointer.create(hkey),
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
    symbols.RegCloseKey(Deno.UnsafePointer.create(hkey));
  },
  deleteKey(hkey, subKey) {
    return symbols.RegDeleteKeyW(Deno.UnsafePointer.create(hkey), stringToWide(subKey));
  },
  deleteValue(hkey, valueName) {
    return symbols.RegDeleteValueW(Deno.UnsafePointer.create(hkey), stringToWide(valueName));
  },
  queryInfoKey(hkey) {
    const subKeyCountBuf = new Uint8Array(4);
    const maxSubKeyLenBuf = new Uint8Array(4);
    const valueCountBuf = new Uint8Array(4);
    const maxValueNameLenBuf = new Uint8Array(4);
    const maxValueLenBuf = new Uint8Array(4);
    const lastWriteTimeBuf = new Uint8Array(8);
    const status = symbols.RegQueryInfoKeyW(
      Deno.UnsafePointer.create(hkey),
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
    const status = symbols.RegEnumKeyExW(
      Deno.UnsafePointer.create(hkey),
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
    const status = symbols.RegEnumValueW(
      Deno.UnsafePointer.create(hkey),
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
    let status = symbols.RegQueryValueExW(
      Deno.UnsafePointer.create(hkey),
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
      status = symbols.RegQueryValueExW(
        Deno.UnsafePointer.create(hkey),
        wName,
        null,
        typeBuf,
        bigBuf,
        sizeBuf,
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
      Deno.UnsafePointer.create(hkey),
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
