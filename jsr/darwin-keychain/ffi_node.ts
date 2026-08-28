/** Node.js FFI backend for macOS Keychain. */

import { createRequire } from "node:module";
import type { DarwinKeychainBackend } from "./types.ts";

const require = createRequire(import.meta.url);
// deno-lint-ignore no-explicit-any -- node:ffi has no ambient type declarations.
let ffi: any;
try {
  ffi = require("node:ffi");
} catch (cause) {
  throw new Error("Unable to load node:ffi. Run Node.js >= 26 with --experimental-ffi.", {
    cause,
  });
}

const sec = ffi.dlopen("/System/Library/Frameworks/Security.framework/Security", {
  SecKeychainFindGenericPassword: {
    arguments: ["pointer", "u32", "pointer", "u32", "pointer", "pointer", "pointer", "pointer"],
    return: "i32",
  },
  SecKeychainAddGenericPassword: {
    arguments: ["pointer", "u32", "pointer", "u32", "pointer", "u32", "pointer", "pointer"],
    return: "i32",
  },
  SecKeychainItemModifyAttributesAndData: {
    arguments: ["pointer", "pointer", "u32", "pointer"],
    return: "i32",
  },
  SecKeychainItemDelete: { arguments: ["pointer"], return: "i32" },
  SecKeychainItemFreeContent: { arguments: ["pointer", "pointer"], return: "i32" },
});
const cf = ffi.dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", {
  CFRelease: { arguments: ["pointer"], return: "void" },
});

const ERR_ITEM_NOT_FOUND = -25300;
const encoder = new TextEncoder();

function check(status: number, operation: string): void {
  if (status !== 0)
    throw new Error(`${operation} failed (${status})`);
}

function readPointer(buffer: Uint8Array): bigint {
  return new DataView(buffer.buffer).getBigUint64(0, true);
}

function find(service: string, account: string): {
  data: bigint;
  item: bigint;
  length: number;
} | null {
  const serviceBytes = encoder.encode(service);
  const accountBytes = encoder.encode(account);
  const length = new Uint8Array(4);
  const data = new Uint8Array(8);
  const item = new Uint8Array(8);
  const status = sec.functions.SecKeychainFindGenericPassword(
    null,
    serviceBytes.length,
    serviceBytes,
    accountBytes.length,
    accountBytes,
    length,
    data,
    item,
  );
  if (status === ERR_ITEM_NOT_FOUND)
    return null;
  check(status, "SecKeychainFindGenericPassword");
  return {
    data: readPointer(data),
    item: readPointer(item),
    length: new DataView(length.buffer).getUint32(0, true),
  };
}

function release(found: { data: bigint; item: bigint } | null): void {
  if (!found)
    return;
  if (found.data)
    sec.functions.SecKeychainItemFreeContent(null, found.data);
  if (found.item)
    cf.functions.CFRelease(found.item);
}

/** Raw generic-password operations implemented through Node.js FFI. */
export const backend: DarwinKeychainBackend = {
  getSecretBytes(service, account): Uint8Array | null {
    const found = find(service, account);
    if (!found)
      return null;
    try {
      return new Uint8Array(ffi.toArrayBuffer(found.data, found.length));
    } finally {
      release(found);
    }
  },
  saveSecretBytes(service, account, secret): void {
    const found = find(service, account);
    try {
      if (found) {
        check(
          sec.functions.SecKeychainItemModifyAttributesAndData(
            found.item,
            null,
            secret.length,
            secret,
          ),
          "SecKeychainItemModifyAttributesAndData",
        );
        return;
      }
      const serviceBytes = encoder.encode(service);
      const accountBytes = encoder.encode(account);
      const item = new Uint8Array(8);
      check(
        sec.functions.SecKeychainAddGenericPassword(
          null,
          serviceBytes.length,
          serviceBytes,
          accountBytes.length,
          accountBytes,
          secret.length,
          secret,
          item,
        ),
        "SecKeychainAddGenericPassword",
      );
      const pointer = readPointer(item);
      if (pointer)
        cf.functions.CFRelease(pointer);
    } finally {
      release(found);
    }
  },
  removeSecret(service, account): boolean {
    const found = find(service, account);
    if (!found)
      return false;
    try {
      check(sec.functions.SecKeychainItemDelete(found.item), "SecKeychainItemDelete");
      return true;
    } finally {
      release(found);
    }
  },
};
