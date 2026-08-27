import type { RawCredential, WinCredentials } from "./types.js";
import { stringToWide } from "./types.js";
import { dlopen, type Pointer, ptr, read, toArrayBuffer } from "bun:ffi";

const lib = dlopen("advapi32.dll", {
  CredWriteW: { args: ["ptr", "u32"], returns: "i32" },
  CredReadW: { args: ["ptr", "u32", "u32", "ptr"], returns: "i32" },
  CredDeleteW: { args: ["ptr", "u32", "u32"], returns: "i32" },
  CredEnumerateW: { args: ["ptr", "u32", "ptr", "ptr"], returns: "i32" },
  CredFree: { args: ["ptr"], returns: "void" },
});
const k32 = dlopen("kernel32.dll", { GetLastError: { args: [], returns: "u32" } });
const { symbols } = lib;
const k32s = k32.symbols;
const SIZEOF_CREDENTIALW = 80;
const OFF_FLAGS = 0;
const OFF_TYPE = 4;
const OFF_TARGET_NAME = 8;
const OFF_COMMENT = 16;
const OFF_LAST_WRITTEN = 24;
const OFF_BLOB_SIZE = 32;
const OFF_BLOB = 40;
const OFF_PERSIST = 48;
const OFF_ATTR_COUNT = 52;
const OFF_TARGET_ALIAS = 64;
const OFF_USER_NAME = 72;
function readWideString(intPtr: number): string {
  if (intPtr === 0) return "";
  const chars: number[] = [];
  for (let i = 0;; i += 2) {
    const lo = read.u8(intPtr as Pointer, i);
    const hi = read.u8(intPtr as Pointer, i + 1);
    if (lo === 0 && hi === 0) break;
    chars.push(lo | (hi << 8));
  }
  return String.fromCharCode(...chars);
}
function readBytes(pointer: number, length: number): Uint8Array {
  if (pointer === 0 || length === 0) return new Uint8Array(0);
  return new Uint8Array(toArrayBuffer(pointer as Pointer, 0, length));
}
function readU32At(pointer: number, offset: number): number {
  return read.u32(pointer as Pointer, offset);
}
function readPtrAt(pointer: number, offset: number): number {
  return Number(read.ptr(pointer as Pointer, offset));
}
function readU64At(pointer: number, offset: number): bigint {
  return read.u64(pointer as Pointer, offset);
}
function parseCredential(credPtr: number): RawCredential {
  const blobSize = readU32At(credPtr, OFF_BLOB_SIZE);
  const blobPtr = readPtrAt(credPtr, OFF_BLOB);
  return {
    flags: readU32At(credPtr, OFF_FLAGS),
    type: readU32At(credPtr, OFF_TYPE),
    targetName: readWideString(readPtrAt(credPtr, OFF_TARGET_NAME)),
    comment: readWideString(readPtrAt(credPtr, OFF_COMMENT)),
    lastWritten: readU64At(credPtr, OFF_LAST_WRITTEN),
    credentialBlobSize: blobSize,
    credentialBlob: readBytes(blobPtr, blobSize),
    persist: readU32At(credPtr, OFF_PERSIST),
    attributeCount: readU32At(credPtr, OFF_ATTR_COUNT),
    targetAlias: readWideString(readPtrAt(credPtr, OFF_TARGET_ALIAS)),
    userName: readWideString(readPtrAt(credPtr, OFF_USER_NAME)),
  };
}
function buildCredentialBuffer(cred: RawCredential): { structBuf: Uint8Array; refs: Uint8Array[] } {
  const refs: Uint8Array[] = [];
  const buf = new Uint8Array(SIZEOF_CREDENTIALW);
  const view = new DataView(buf.buffer);
  view.setUint32(OFF_FLAGS, cred.flags, true);
  view.setUint32(OFF_TYPE, cred.type, true);
  const wTarget = stringToWide(cred.targetName);
  refs.push(wTarget);
  view.setBigUint64(OFF_TARGET_NAME, BigInt(ptr(wTarget)), true);
  const wComment = stringToWide(cred.comment);
  refs.push(wComment);
  view.setBigUint64(OFF_COMMENT, BigInt(ptr(wComment)), true);
  view.setBigUint64(OFF_LAST_WRITTEN, cred.lastWritten, true);
  view.setUint32(OFF_BLOB_SIZE, cred.credentialBlob.length, true);
  const blob = cred.credentialBlob;
  refs.push(blob);
  if (blob.length > 0) view.setBigUint64(OFF_BLOB, BigInt(ptr(blob)), true);
  view.setUint32(OFF_PERSIST, cred.persist, true);
  view.setUint32(OFF_ATTR_COUNT, 0, true);
  const wAlias = stringToWide(cred.targetAlias);
  refs.push(wAlias);
  if (cred.targetAlias) view.setBigUint64(OFF_TARGET_ALIAS, BigInt(ptr(wAlias)), true);
  const wUser = stringToWide(cred.userName);
  refs.push(wUser);
  if (cred.userName) view.setBigUint64(OFF_USER_NAME, BigInt(ptr(wUser)), true);
  return { structBuf: buf, refs };
}
export const backend: WinCredentials = {
  write(cred: RawCredential, flags: number): void {
    const { structBuf } = buildCredentialBuffer(cred);
    const ok = symbols.CredWriteW(ptr(structBuf), flags);
    if (!ok) throw new Error(`CredWriteW failed with error code ${k32s.GetLastError()}`);
  },
  read(targetName: string, type: number): RawCredential | null {
    const wTarget = stringToWide(targetName);
    const outBuf = new Uint8Array(8);
    const ok = symbols.CredReadW(ptr(wTarget), type, 0, ptr(outBuf));
    if (!ok) return null;
    const credPtr = Number(new DataView(outBuf.buffer).getBigUint64(0, true));
    try {
      return parseCredential(credPtr);
    } finally {
      symbols.CredFree(credPtr as Pointer);
    }
  },
  delete(targetName: string, type: number): boolean {
    return !!symbols.CredDeleteW(ptr(stringToWide(targetName)), type, 0);
  },
  enumerate(filter: string | null, flags: number): RawCredential[] {
    const countBuf = new Uint8Array(4);
    const credsBuf = new Uint8Array(8);
    const ok = symbols.CredEnumerateW(
      filter !== null ? ptr(stringToWide(filter)) : null,
      flags,
      ptr(countBuf),
      ptr(credsBuf),
    );
    if (!ok) return [];
    const count = new DataView(countBuf.buffer).getUint32(0, true);
    const arrayPtr = Number(new DataView(credsBuf.buffer).getBigUint64(0, true));
    const results: RawCredential[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const credPtr = Number(read.ptr(arrayPtr as Pointer, i * 8));
        results.push(parseCredential(credPtr));
      }
    } finally {
      symbols.CredFree(arrayPtr as Pointer);
    }
    return results;
  },
};
