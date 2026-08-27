/** Native macOS Keychain API. @module @neotales/darwin-keychain/ffi */

import type {
  DarwinKeychainBackend,
  GenericPassword,
  KeychainHandle,
  KeychainRuntime,
  SecretRecord,
} from "./types.ts";
import { DARWIN, KeychainHandle as KeychainHandleValue } from "./types.ts";

let unavailableReason = "macOS Keychain is only available through Deno FFI on macOS.";
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
let runtime: KeychainRuntime = "node";
interface DarwinKeychainApi {
  getSecretBytes(service: string, account: string): Uint8Array | null;
  saveSecretBytes(service: string, account: string, secret: Uint8Array): void;
  removeSecret(service: string, account: string): boolean;
  listSecrets(service: string): SecretRecord[];
}
type SecurityApi = {
  SecKeychainFindGenericPassword(service: string, account: string): GenericPassword | null;
  SecKeychainAddGenericPassword(
    service: string,
    account: string,
    secret: Uint8Array,
  ): KeychainHandle;
  SecKeychainItemModifyAttributesAndData(item: KeychainHandle, secret: Uint8Array): void;
  SecKeychainItemDelete(item: KeychainHandle): void;
  SecKeychainSearchCreateFromAttributes(service: string): KeychainHandle;
  SecKeychainSearchCopyNext(search: KeychainHandle): KeychainHandle | null;
  SecKeychainItemCopyAttributesAndData(item: KeychainHandle, service: string): SecretRecord | null;
  CFRelease(handle: KeychainHandle): void;
};
const unavailableSecurity: SecurityApi = {
  SecKeychainFindGenericPassword(): GenericPassword | null {
    return unavailable();
  },
  SecKeychainAddGenericPassword(): KeychainHandle {
    return unavailable();
  },
  SecKeychainItemModifyAttributesAndData(): void {
    unavailable();
  },
  SecKeychainItemDelete(): void {
    unavailable();
  },
  SecKeychainSearchCreateFromAttributes(): KeychainHandle {
    return unavailable();
  },
  SecKeychainSearchCopyNext(): KeychainHandle | null {
    return unavailable();
  },
  SecKeychainItemCopyAttributesAndData(): SecretRecord | null {
    return unavailable();
  },
  CFRelease(): void {
    unavailable();
  },
};
type ItemPointer = { service: string; account: string };
type SearchPointer = { records: SecretRecord[]; index: number };

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

const portableSecurity: SecurityApi = {
  SecKeychainFindGenericPassword(service, account): GenericPassword | null {
    const secret = backend.getSecretBytes(service, account);
    return secret === null
      ? null
      : { item: new KeychainHandleValue(runtime, { service, account }), secret };
  },
  SecKeychainAddGenericPassword(service, account, secret): KeychainHandle {
    backend.saveSecretBytes(service, account, secret);
    return new KeychainHandleValue(runtime, { service, account });
  },
  SecKeychainItemModifyAttributesAndData(item, secret): void {
    const pointer = itemPointer(item);
    backend.saveSecretBytes(pointer.service, pointer.account, secret);
  },
  SecKeychainItemDelete(item): void {
    const pointer = itemPointer(item);
    if (!backend.removeSecret(pointer.service, pointer.account))
      throw new Error("SecKeychainItemDelete could not find the item.");
  },
  SecKeychainSearchCreateFromAttributes(service): KeychainHandle {
    if (backend.listSecrets === undefined)
      throw new Error("Keychain enumeration is unavailable in this runtime.");
    return new KeychainHandleValue(runtime, { records: backend.listSecrets(service), index: 0 });
  },
  SecKeychainSearchCopyNext(search): KeychainHandle | null {
    const pointer = searchPointer(search);
    const record = pointer.records[pointer.index++];
    return record === undefined
      ? null
      : new KeychainHandleValue(runtime, { service: record.service, account: record.account });
  },
  SecKeychainItemCopyAttributesAndData(item, service): SecretRecord | null {
    const pointer = itemPointer(item);
    if (pointer.service !== service)
      throw new RangeError("Item handle does not belong to the requested service.");
    const secret = backend.getSecretBytes(service, pointer.account);
    return secret === null ? null : { service, account: pointer.account, secret };
  },
  CFRelease(handle): void {
    if (handle.runtime !== runtime)
      throw new TypeError("Keychain handle belongs to a different runtime.");
  },
};

let Security = unavailableSecurity;
let available = false;
if (DARWIN) {
  try {
    if ("Deno" in globalThis) {
      const ffi = await import("./ffi_deno.ts");
      backend = ffi.backend;
      Security = ffi.Security;
      runtime = "deno";
    } else if ("Bun" in globalThis) {
      backend = (await import("./ffi_bun.ts")).backend;
      Security = portableSecurity;
      runtime = "bun";
    } else {
      backend = (await import("./ffi_node.ts")).backend;
      Security = portableSecurity;
      runtime = "node";
    }
    available = true;
  } catch (error) {
    unavailableReason = error instanceof Error ? error.message : String(error);
  }
}

function unavailable(): never {
  throw new Error(unavailableReason);
}

/** Reports whether the native Keychain backend loaded successfully. */
export function isDarwinKeychainAvailable(): boolean {
  return available;
}

/** Byte-oriented native generic-password operations. */
export const DarwinKeychain: DarwinKeychainApi = {
  getSecretBytes(service: string, account: string): Uint8Array | null {
    return backend.getSecretBytes(service, account);
  },
  saveSecretBytes(service: string, account: string, secret: Uint8Array): void {
    backend.saveSecretBytes(service, account, secret);
  },
  removeSecret(service: string, account: string): boolean {
    return backend.removeSecret(service, account);
  },
  listSecrets(service: string): SecretRecord[] {
    if (backend.listSecrets === undefined)
      throw new Error("Keychain enumeration is unavailable in this runtime.");
    return backend.listSecrets(service);
  },
};

export { Security };
export {
  DARWIN,
  type DarwinKeychainBackend,
  type GenericPassword,
  KeychainHandle,
  type KeychainRuntime,
  type SecretRecord,
} from "./types.ts";
