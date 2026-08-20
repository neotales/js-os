/**
 * darwin-keychain ffi_bun module.
 *
 * @module @neotales/darwin-keychain
 */

import { dlopen, type Pointer, ptr, read } from "bun:ffi";
import type { DarwinKeychainBackend } from "./types.js";

const sec = dlopen("/System/Library/Frameworks/Security.framework/Security", {
  SecKeychainFindGenericPassword: {
    args: ["ptr", "u32", "ptr", "u32", "ptr", "ptr", "ptr", "ptr"],
    returns: "i32",
  },
  SecKeychainAddGenericPassword: {
    args: ["ptr", "u32", "ptr", "u32", "ptr", "u32", "ptr", "ptr"],
    returns: "i32",
  },
  SecKeychainItemModifyAttributesAndData: {
    args: ["ptr", "ptr", "u32", "ptr"],
    returns: "i32",
  },
  SecKeychainItemDelete: {
    args: ["ptr"],
    returns: "i32",
  },
  SecKeychainItemFreeContent: {
    args: ["ptr", "ptr"],
    returns: "i32",
  },
});

const cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", {
  CFRelease: {
    args: ["ptr"],
    returns: "void",
  },
});

const ERR_ITEM_NOT_FOUND = -25300;

const enc = new TextEncoder();

function cbytes(value: string): Uint8Array {
  return enc.encode(value);
}

function osCheck(status: number, message: string): void {
  if (status !== 0) throw new Error(`${message} (${status})`);
}

function readPtr(buf: Uint8Array): number {
  return Number(new DataView(buf.buffer).getBigUint64(0, true));
}

function ptrToBytes(intPtr: number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = read.u8(intPtr as Pointer, i);
  return out;
}

function findRecord(
  service: string,
  account: string,
): {
  dataPtr: number;
  itemPtr: number;
  passwordLength: number;
} | null {
  const serviceBytes = cbytes(service);
  const accountBytes = cbytes(account);
  const pwLenBuf = new Uint8Array(4);
  const pwDataBuf = new Uint8Array(8);
  const itemRefBuf = new Uint8Array(8);

  const status = sec.symbols.SecKeychainFindGenericPassword(
    null,
    serviceBytes.length,
    ptr(serviceBytes),
    accountBytes.length,
    ptr(accountBytes),
    ptr(pwLenBuf),
    ptr(pwDataBuf),
    ptr(itemRefBuf),
  );

  if (status === ERR_ITEM_NOT_FOUND) return null;
  osCheck(status, "SecKeychainFindGenericPassword failed");

  return {
    dataPtr: readPtr(pwDataBuf),
    itemPtr: readPtr(itemRefBuf),
    passwordLength: new DataView(pwLenBuf.buffer).getUint32(0, true),
  };
}

function releaseFindResult(found: { dataPtr: number; itemPtr: number } | null): void {
  if (!found) return;
  if (found.dataPtr) sec.symbols.SecKeychainItemFreeContent(null, found.dataPtr as Pointer);
  if (found.itemPtr) cf.symbols.CFRelease(found.itemPtr as Pointer);
}

export const backend: DarwinKeychainBackend = {
  getSecretBytes(service: string, account: string): Uint8Array | null {
    const found = findRecord(service, account);
    if (!found) return null;
    try {
      return ptrToBytes(found.dataPtr, found.passwordLength);
    } finally {
      releaseFindResult(found);
    }
  },

  setSecretBytes(service: string, account: string, secret: Uint8Array): void {
    const found = findRecord(service, account);
    try {
      if (found && found.itemPtr) {
        osCheck(
          sec.symbols.SecKeychainItemModifyAttributesAndData(
            found.itemPtr as Pointer,
            null,
            secret.length,
            ptr(secret),
          ),
          "SecKeychainItemModifyAttributesAndData failed",
        );
        return;
      }

      const serviceBytes = cbytes(service);
      const accountBytes = cbytes(account);
      const itemOut = new Uint8Array(8);
      osCheck(
        sec.symbols.SecKeychainAddGenericPassword(
          null,
          serviceBytes.length,
          ptr(serviceBytes),
          accountBytes.length,
          ptr(accountBytes),
          secret.length,
          ptr(secret),
          ptr(itemOut),
        ),
        "SecKeychainAddGenericPassword failed",
      );
      const item = readPtr(itemOut);
      if (item) cf.symbols.CFRelease(item as Pointer);
    } finally {
      releaseFindResult(found);
    }
  },

  deleteSecret(service: string, account: string): boolean {
    const found = findRecord(service, account);
    if (!found) return false;
    try {
      osCheck(
        sec.symbols.SecKeychainItemDelete(found.itemPtr as Pointer),
        "SecKeychainItemDelete failed",
      );
      return true;
    } finally {
      releaseFindResult(found);
    }
  },
};
