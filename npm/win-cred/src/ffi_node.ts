import type { CredentialBackend, RawCredential } from "./types.js";
import { stringToWide } from "./types.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffi = require("node:ffi");
const lib = ffi.dlopen("advapi32.dll", {
  CredWriteW: { arguments: ["pointer", "u32"], return: "i32" },
  CredReadW: { arguments: ["pointer", "u32", "u32", "pointer"], return: "i32" },
  CredDeleteW: { arguments: ["pointer", "u32", "u32"], return: "i32" },
  CredEnumerateW: { arguments: ["pointer", "u32", "pointer", "pointer"], return: "i32" },
  CredFree: { arguments: ["pointer"], return: "void" },
});
const k32 = ffi.dlopen("kernel32.dll", { GetLastError: { arguments: [], return: "u32" } });
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
function readWideString(ptr: bigint): string {
  if (ptr === 0n) return "";
  const chars: number[] = [];
  for (let i = 0;; i += 2) {
    const lo = ffi.getUint8(ptr, i);
    const hi = ffi.getUint8(ptr, i + 1);
    if (lo === 0 && hi === 0) break;
    chars.push(lo | (hi << 8));
  }
  return String.fromCharCode(...chars);
}
function readBytes(ptr: bigint, length: number): Uint8Array {
  if (ptr === 0n || length === 0) return new Uint8Array(0);
  return new Uint8Array(ffi.toArrayBuffer(ptr, length));
}
function parseCredential(credPtr: bigint): RawCredential {
  const raw = new Uint8Array(ffi.toArrayBuffer(credPtr, SIZEOF_CREDENTIALW));
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const blobSize = view.getUint32(OFF_BLOB_SIZE, true);
  const blobPtr = view.getBigUint64(OFF_BLOB, true);
  return {
    flags: view.getUint32(OFF_FLAGS, true),
    type: view.getUint32(OFF_TYPE, true),
    targetName: readWideString(view.getBigUint64(OFF_TARGET_NAME, true)),
    comment: readWideString(view.getBigUint64(OFF_COMMENT, true)),
    lastWritten: view.getBigUint64(OFF_LAST_WRITTEN, true),
    credentialBlobSize: blobSize,
    credentialBlob: readBytes(blobPtr, blobSize),
    persist: view.getUint32(OFF_PERSIST, true),
    attributeCount: view.getUint32(OFF_ATTR_COUNT, true),
    targetAlias: readWideString(view.getBigUint64(OFF_TARGET_ALIAS, true)),
    userName: readWideString(view.getBigUint64(OFF_USER_NAME, true)),
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
  view.setBigUint64(OFF_TARGET_NAME, ffi.getRawPointer(wTarget), true);
  const wComment = stringToWide(cred.comment);
  refs.push(wComment);
  view.setBigUint64(OFF_COMMENT, ffi.getRawPointer(wComment), true);
  view.setBigUint64(OFF_LAST_WRITTEN, cred.lastWritten, true);
  view.setUint32(OFF_BLOB_SIZE, cred.credentialBlob.length, true);
  const blob = cred.credentialBlob;
  refs.push(blob);
  if (blob.length > 0) view.setBigUint64(OFF_BLOB, ffi.getRawPointer(blob), true);
  view.setUint32(OFF_PERSIST, cred.persist, true);
  view.setUint32(OFF_ATTR_COUNT, 0, true);
  const wAlias = stringToWide(cred.targetAlias);
  refs.push(wAlias);
  if (cred.targetAlias) view.setBigUint64(OFF_TARGET_ALIAS, ffi.getRawPointer(wAlias), true);
  const wUser = stringToWide(cred.userName);
  refs.push(wUser);
  if (cred.userName) view.setBigUint64(OFF_USER_NAME, ffi.getRawPointer(wUser), true);
  return { structBuf: buf, refs };
}
export const backend: CredentialBackend = {
  write(cred: RawCredential, flags: number): void {
    const { structBuf } = buildCredentialBuffer(cred);
    const ok = lib.functions.CredWriteW(structBuf, flags);
    if (!ok) throw new Error(`CredWriteW failed with error code ${k32.functions.GetLastError()}`);
  },
  read(targetName: string, type: number): RawCredential | null {
    const wTarget = stringToWide(targetName);
    const outBuf = new Uint8Array(8);
    const ok = lib.functions.CredReadW(wTarget, type, 0, outBuf);
    if (!ok) return null;
    const credPtr = new DataView(outBuf.buffer).getBigUint64(0, true);
    try {
      return parseCredential(credPtr);
    } finally {
      lib.functions.CredFree(credPtr);
    }
  },
  delete(targetName: string, type: number): boolean {
    return !!lib.functions.CredDeleteW(stringToWide(targetName), type, 0);
  },
  enumerate(filter: string | null, flags: number): RawCredential[] {
    const countBuf = new Uint8Array(4);
    const credsBuf = new Uint8Array(8);
    const ok = lib.functions.CredEnumerateW(
      filter !== null ? stringToWide(filter) : null,
      flags,
      countBuf,
      credsBuf,
    );
    if (!ok) return [];
    const count = new DataView(countBuf.buffer).getUint32(0, true);
    const arrayPtr = new DataView(credsBuf.buffer).getBigUint64(0, true);
    const results: RawCredential[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const credPtr = lib.functions.CredFree ? Number(ffi.getUint64(arrayPtr, i * 8)) : 0;
        results.push(parseCredential(BigInt(credPtr)));
      }
    } finally {
      lib.functions.CredFree(arrayPtr);
    }
    return results;
  },
};
