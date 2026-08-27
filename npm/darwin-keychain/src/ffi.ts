/** Native macOS Keychain API. @module @neotales/darwin-keychain/ffi */

import type {
  DarwinKeychainBackend,
  GenericPassword,
  KeychainHandle,
  KeychainRuntime,
  SecretRecord,
} from "./types.js";
import { DARWIN, KeychainHandle as KeychainHandleValue } from "./types.js";

let unavailableReason = "macOS Keychain is only available on macOS.";
const unavailableBackend: DarwinKeychainBackend = {
  getSecretBytes(): Uint8Array | null {
    return unavailable();
  },
  saveSecretBytes(): void {
    unavailable();
  },
  removeSecret(): boolean {
    return unavailable();
  },
  listSecrets(): SecretRecord[] {
    return unavailable();
  },
};

let backend = unavailableBackend;
let available = false;
let runtime: KeychainRuntime = "node";
if (DARWIN) {
  try {
    if ("Deno" in globalThis) {
      backend = (await import("./ffi_deno.js")).backend;
      runtime = "deno";
    } else if ("Bun" in globalThis) {
      backend = (await import("./ffi_bun.js")).backend;
      runtime = "bun";
    } else {
      try {
        backend = (await import("./ffi_node.js")).backend;
        runtime = "node";
      } catch {
        backend = (await import("./ffi_koffi.js")).backend;
        runtime = "koffi";
      }
    }
    available = true;
  } catch (error) {
    unavailableReason = error instanceof Error
      ? `${error.message}. Run Node.js >= 26 with --experimental-ffi, or install koffi with npm install koffi.`
      : String(error);
  }
}

function unavailable(): never {
  throw new Error(unavailableReason);
}

/**
 * Reports whether the native Keychain backend loaded successfully.
 *
 * @returns `true` when Security.framework operations are available.
 * @example
 * ```ts
 * import { isAvailable } from "@neotales/darwin-keychain/ffi";
 *
 * if (isAvailable()) console.log("Keychain is available");
 * ```
 */
export function isAvailable(): boolean {
  return available;
}

/**
 * Byte-oriented native generic-password operations.
 *
 * @example
 * ```ts
 * import { DarwinKeychain } from "@neotales/darwin-keychain/ffi";
 *
 * const secret = DarwinKeychain.getSecretBytes("service", "account");
 * ```
 */
export const DarwinKeychain = {
  /**
   * Reads secret bytes from a generic-password item.
   * @param service Keychain service name.
   * @param account Keychain account name.
   * @returns Secret bytes, or `null` when absent.
   * @example
   * ```ts
   * import { DarwinKeychain } from "@neotales/darwin-keychain/ffi";
   *
   * const secret = DarwinKeychain.getSecretBytes("service", "account");
   * ```
   */
  getSecretBytes(service: string, account: string): Uint8Array | null {
    return backend.getSecretBytes(service, account);
  },
  /**
   * Creates or replaces a generic-password item.
   * @param service Keychain service name.
   * @param account Keychain account name.
   * @param secret Secret bytes to store.
   * @returns Nothing.
   * @example
   * ```ts
   * import { DarwinKeychain } from "@neotales/darwin-keychain/ffi";
   *
   * DarwinKeychain.saveSecretBytes("service", "account", new Uint8Array([1]));
   * ```
   */
  saveSecretBytes(service: string, account: string, secret: Uint8Array): void {
    backend.saveSecretBytes(service, account, secret);
  },
  /**
   * Deletes a generic-password item.
   * @param service Keychain service name.
   * @param account Keychain account name.
   * @returns `true` when an item was deleted.
   * @example
   * ```ts
   * import { DarwinKeychain } from "@neotales/darwin-keychain/ffi";
   *
   * DarwinKeychain.removeSecret("service", "account");
   * ```
   */
  removeSecret(service: string, account: string): boolean {
    return backend.removeSecret(service, account);
  },
  /**
   * Lists generic-password items for a service.
   * @param service Keychain service name.
   * @returns Matching records with copied secret bytes.
   * @example
   * ```ts
   * import { DarwinKeychain } from "@neotales/darwin-keychain/ffi";
   *
   * const records = DarwinKeychain.listSecrets("service");
   * ```
   */
  listSecrets(service: string): SecretRecord[] {
    if (backend.listSecrets === undefined)
      throw new Error("Keychain enumeration is unavailable in this runtime.");
    return backend.listSecrets(service);
  },
};

type ItemPointer = { service: string; account: string };
type SearchPointer = { service: string; records: SecretRecord[]; index: number };

function itemPointer(handle: KeychainHandle): ItemPointer {
  if (handle.runtime !== runtime)
    throw new TypeError("Keychain handle belongs to a different runtime.");
  const pointer = handle.valueOf();
  if (!pointer || typeof pointer !== "object" || !("service" in pointer) || !("account" in pointer))
    throw new TypeError("Invalid Keychain item handle.");
  return pointer as ItemPointer;
}

function searchPointer(handle: KeychainHandle): SearchPointer {
  if (handle.runtime !== runtime)
    throw new TypeError("Keychain handle belongs to a different runtime.");
  const pointer = handle.valueOf();
  if (!pointer || typeof pointer !== "object" || !("records" in pointer) || !("index" in pointer))
    throw new TypeError("Invalid Keychain search handle.");
  return pointer as SearchPointer;
}

/**
 * Security.framework-style operations using opaque handles.
 *
 * @example
 * ```ts
 * import { Security } from "@neotales/darwin-keychain/ffi";
 *
 * const result = Security.SecKeychainFindGenericPassword("service", "account");
 * ```
 */
export const Security = {
  /**
   * Finds a native generic-password item.
   *
   * @param service Service name.
   * @param account Account name.
   * @returns An owned item and copied secret, or `null`.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * const result = Security.SecKeychainFindGenericPassword("service", "account");
   * ```
   */
  SecKeychainFindGenericPassword(service: string, account: string): GenericPassword | null {
    const secret = backend.getSecretBytes(service, account);
    return secret === null
      ? null
      : { item: new KeychainHandleValue(runtime, { service, account }), secret };
  },
  /**
   * Adds a native generic-password item.
   *
   * @param service Service name.
   * @param account Account name.
   * @param secret Secret bytes.
   * @returns An owned item handle.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * const item = Security.SecKeychainAddGenericPassword("service", "account", new Uint8Array());
   * ```
   */
  SecKeychainAddGenericPassword(
    service: string,
    account: string,
    secret: Uint8Array,
  ): KeychainHandle {
    backend.saveSecretBytes(service, account, secret);
    return new KeychainHandleValue(runtime, { service, account });
  },
  /**
   * Replaces item data.
   *
   * @param item Owned item handle.
   * @param secret Replacement bytes.
   * @returns Nothing.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * Security.SecKeychainItemModifyAttributesAndData(item, new Uint8Array());
   * ```
   */
  SecKeychainItemModifyAttributesAndData(item: KeychainHandle, secret: Uint8Array): void {
    const pointer = itemPointer(item);
    backend.saveSecretBytes(pointer.service, pointer.account, secret);
  },
  /**
   * Deletes an item.
   *
   * @param item Owned item handle.
   * @returns Nothing.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * Security.SecKeychainItemDelete(item);
   * ```
   */
  SecKeychainItemDelete(item: KeychainHandle): void {
    const pointer = itemPointer(item);
    if (!backend.removeSecret(pointer.service, pointer.account))
      throw new Error("SecKeychainItemDelete could not find the item.");
  },
  /**
   * Creates a generic-password search.
   *
   * @param service Service name.
   * @returns An owned search handle.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * const search = Security.SecKeychainSearchCreateFromAttributes("service");
   * ```
   */
  SecKeychainSearchCreateFromAttributes(service: string): KeychainHandle {
    if (backend.listSecrets === undefined)
      throw new Error("Keychain enumeration is unavailable in this runtime.");
    return new KeychainHandleValue(runtime, {
      service,
      records: backend.listSecrets(service),
      index: 0,
    });
  },
  /**
   * Advances a search.
   *
   * @param search Owned search handle.
   * @returns The next owned item, or `null`.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * const item = Security.SecKeychainSearchCopyNext(search);
   * ```
   */
  SecKeychainSearchCopyNext(search: KeychainHandle): KeychainHandle | null {
    const pointer = searchPointer(search);
    const record = pointer.records[pointer.index++];
    return record === undefined
      ? null
      : new KeychainHandleValue(runtime, { service: record.service, account: record.account });
  },
  /**
   * Copies an item's account and secret.
   *
   * @param item Owned item handle.
   * @param service Service name.
   * @returns A copied record, or `null`.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * const record = Security.SecKeychainItemCopyAttributesAndData(item, "service");
   * ```
   */
  SecKeychainItemCopyAttributesAndData(item: KeychainHandle, service: string): SecretRecord | null {
    const pointer = itemPointer(item);
    if (pointer.service !== service)
      throw new RangeError("Item handle does not belong to the requested service.");
    const secret = backend.getSecretBytes(service, pointer.account);
    return secret === null ? null : { service, account: pointer.account, secret };
  },
  /**
   * Releases an owned Security.framework reference.
   *
   * @param handle Owned item or search handle.
   * @returns Nothing.
   * @example
   * ```ts
   * import { Security } from "@neotales/darwin-keychain/ffi";
   *
   * Security.CFRelease(handle);
   * ```
   */
  CFRelease(handle: KeychainHandle): void {
    if (handle.runtime !== runtime)
      throw new TypeError("Keychain handle belongs to a different runtime.");
  },
};

export {
  DARWIN,
  type DarwinKeychainBackend,
  type GenericPassword,
  KeychainHandle,
  type KeychainRuntime,
  type SecretRecord,
} from "./types.js";
