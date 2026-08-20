/**
 * darwin-keychain ffi_koffi module.
 *
 * @module @neotales/darwin-keychain
 */

import type { DarwinKeychainBackend, SecretRecord } from "./types.js";
import process from "node:process";

const { createRequire } = process.getBuiltinModule("node:module");
const req = createRequire(import.meta.url ?? "file:///");
const koffi = req("koffi");

const sec = koffi.load("/System/Library/Frameworks/Security.framework/Security");
const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");

const SecKeychainFindGenericPassword = sec.func(
  "int SecKeychainFindGenericPassword(void *keychainOrArray, uint32 serviceNameLength, const void *serviceName, uint32 accountNameLength, const void *accountName, _Out_ uint32 *passwordLength, _Out_ void **passwordData, _Out_ void **itemRef)",
);
const SecKeychainAddGenericPassword = sec.func(
  "int SecKeychainAddGenericPassword(void *keychain, uint32 serviceNameLength, const void *serviceName, uint32 accountNameLength, const void *accountName, uint32 passwordLength, const void *passwordData, _Out_ void **itemRef)",
);
const SecKeychainItemModifyAttributesAndData = sec.func(
  "int SecKeychainItemModifyAttributesAndData(void *itemRef, void *attrList, uint32 length, const void *data)",
);
const SecKeychainItemDelete = sec.func("int SecKeychainItemDelete(void *itemRef)");
const SecKeychainItemFreeContent = sec.func(
  "int SecKeychainItemFreeContent(void *attrList, void *data)",
);
const SecKeychainSearchCreateFromAttributes = sec.func(
  "int SecKeychainSearchCreateFromAttributes(void *keychainOrArray, int itemClass, void *attrList, _Out_ void **searchRef)",
);
const SecKeychainSearchCopyNext = sec.func(
  "int SecKeychainSearchCopyNext(void *searchRef, _Out_ void **itemRef)",
);
const SecKeychainItemCopyAttributesAndData = sec.func(
  "int SecKeychainItemCopyAttributesAndData(void *itemRef, void *info, void *itemClass, _Out_ void **attrList, _Out_ uint32 *length, void *outData)",
);
const SecKeychainItemFreeAttributesAndData = sec.func(
  "int SecKeychainItemFreeAttributesAndData(void *attrList, void *data)",
);
const CFRelease = cf.func("void CFRelease(void *cf)");

const ERR_ITEM_NOT_FOUND = -25300;
const ITEM_CLASS_GENERIC_PASSWORD = 0x67656e70;
const ATTR_SERVICE = 0x73766365;
const ATTR_ACCOUNT = 0x61636374;

const enc = new TextEncoder();
const dec = new TextDecoder();

const SecKeychainAttribute = koffi.struct("SecKeychainAttribute", {
  tag: "uint32",
  length: "uint32",
  data: "void *",
});
const SecKeychainAttributeList = koffi.struct("SecKeychainAttributeList", {
  count: "uint32",
  attr: "SecKeychainAttribute *",
});

function cbytes(value: string): Uint8Array {
  return enc.encode(value);
}

function osCheck(status: number, message: string): void {
  if (status !== 0)
    throw new Error(`${message} (${status})`);
}

function ptrToBytes(value: unknown, length: number): Uint8Array {
  return koffi.decode(value, koffi.array("uint8", length));
}

function ptrAddress(value: unknown): number {
  return Number(koffi.address(value));
}

function rawPtr(value: Uint8Array): number {
  return ptrAddress(value);
}

function makeServiceAttrList(service: string): { list: Uint8Array; refs: Uint8Array[] } {
  const serviceBytes = cbytes(service);
  const attr = new Uint8Array(16);
  const av = new DataView(attr.buffer);
  av.setUint32(0, ATTR_SERVICE, true);
  av.setUint32(4, serviceBytes.length, true);
  av.setBigUint64(8, BigInt(rawPtr(serviceBytes)), true);

  const list = new Uint8Array(16);
  const lv = new DataView(list.buffer);
  lv.setUint32(0, 1, true);
  lv.setBigUint64(8, BigInt(rawPtr(attr)), true);

  return { list, refs: [serviceBytes, attr] };
}

function findRecord(
  service: string,
  account: string,
): {
  dataPtr: unknown;
  itemPtr: unknown;
  passwordLength: number;
} | null {
  const serviceBytes = cbytes(service);
  const accountBytes = cbytes(account);
  const passwordLengthOut = [0];
  const passwordDataOut = [null];
  const itemRefOut = [null];

  const status = SecKeychainFindGenericPassword(
    null,
    serviceBytes.length,
    serviceBytes,
    accountBytes.length,
    accountBytes,
    passwordLengthOut,
    passwordDataOut,
    itemRefOut,
  );
  if (status === ERR_ITEM_NOT_FOUND)
    return null;
  osCheck(status, "SecKeychainFindGenericPassword failed");

  return {
    dataPtr: passwordDataOut[0],
    itemPtr: itemRefOut[0],
    passwordLength: passwordLengthOut[0],
  };
}

function getAccountAttribute(itemPtr: unknown): string {
  const tag = new Uint8Array(4);
  const format = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, ATTR_ACCOUNT, true);

  const info = new Uint8Array(24);
  const iv = new DataView(info.buffer);
  iv.setUint32(0, 1, true);
  iv.setBigUint64(8, BigInt(rawPtr(tag)), true);
  iv.setBigUint64(16, BigInt(rawPtr(format)), true);

  const attrsOut = [null];
  const lengthOut = [0];
  const status = SecKeychainItemCopyAttributesAndData(
    itemPtr,
    info,
    null,
    attrsOut,
    lengthOut,
    null,
  );
  if (status !== 0 || !attrsOut[0])
    return "";

  try {
    const attrs = koffi.decode(attrsOut[0], SecKeychainAttributeList);
    if (attrs.count === 0 || !attrs.attr) {
      return "";
    }

    const attr = koffi.decode(attrs.attr, SecKeychainAttribute);
    if (attr.tag !== ATTR_ACCOUNT || !attr.data || attr.length === 0) {
      return "";
    }
    return dec.decode(ptrToBytes(attr.data, attr.length));
  } finally {
    SecKeychainItemFreeAttributesAndData(attrsOut[0], null);
  }
}

function releaseFindResult(found: { dataPtr: unknown; itemPtr: unknown } | null): void {
  if (!found)
    return;
  if (found.dataPtr)
    SecKeychainItemFreeContent(null, found.dataPtr);
  if (found.itemPtr)
    CFRelease(found.itemPtr);
}

export const backend: DarwinKeychainBackend = {
  getSecretBytes(service: string, account: string): Uint8Array | null {
    const found = findRecord(service, account);
    if (!found)
      return null;
    try {
      return ptrToBytes(found.dataPtr, found.passwordLength);
    } finally {
      releaseFindResult(found);
    }
  },

  setSecretBytes(service: string, account: string, secret: Uint8Array): void {
    const found = findRecord(service, account);
    try {
      if (found?.itemPtr) {
        osCheck(
          SecKeychainItemModifyAttributesAndData(found.itemPtr, null, secret.length, secret),
          "SecKeychainItemModifyAttributesAndData failed",
        );
        return;
      }

      const serviceBytes = cbytes(service);
      const accountBytes = cbytes(account);
      const itemOut = [null];
      osCheck(
        SecKeychainAddGenericPassword(
          null,
          serviceBytes.length,
          serviceBytes,
          accountBytes.length,
          accountBytes,
          secret.length,
          secret,
          itemOut,
        ),
        "SecKeychainAddGenericPassword failed",
      );
      if (itemOut[0])
        CFRelease(itemOut[0]);
    } finally {
      releaseFindResult(found);
    }
  },

  deleteSecret(service: string, account: string): boolean {
    const found = findRecord(service, account);
    if (!found)
      return false;
    try {
      osCheck(SecKeychainItemDelete(found.itemPtr), "SecKeychainItemDelete failed");
      return true;
    } finally {
      releaseFindResult(found);
    }
  },

  list(service: string): SecretRecord[] {
    const { list, refs: _refs } = makeServiceAttrList(service);
    const searchOut = [null];
    const status = SecKeychainSearchCreateFromAttributes(
      null,
      ITEM_CLASS_GENERIC_PASSWORD,
      list,
      searchOut,
    );
    if (status === ERR_ITEM_NOT_FOUND)
      return [];
    osCheck(status, "SecKeychainSearchCreateFromAttributes failed");
    if (!searchOut[0])
      return [];

    const results: SecretRecord[] = [];
    try {
      while (true) {
        const itemOut = [null];
        const next = SecKeychainSearchCopyNext(searchOut[0], itemOut);
        if (next !== 0 || !itemOut[0])
          break;

        try {
          const account = getAccountAttribute(itemOut[0]);
          if (!account)
            continue;
          const secret = this.getSecretBytes(service, account);
          if (secret === null)
            continue;
          results.push({ service, account, secret });
        } finally {
          CFRelease(itemOut[0]);
        }
      }
    } finally {
      CFRelease(searchOut[0]);
    }

    return results;
  },
};
