/** Native macOS Keychain API. @module @neotales/darwin-keychain/ffi */

import type {
  DarwinKeychainBackend,
  GenericPassword,
  KeychainHandle,
  SecretRecord,
} from "./types.ts";
import { DARWIN } from "./types.ts";

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
let Security = unavailableSecurity;
let available = false;
if (DARWIN && "Deno" in globalThis) {
  try {
    const ffi = await import("./ffi_deno.ts");
    backend = ffi.backend;
    Security = ffi.Security;
    available = true;
  } catch (error) {
    unavailableReason = error instanceof Error ? error.message : String(error);
  }
}

function unavailable(): never {
  throw new Error(unavailableReason);
}

/** Reports whether the native Keychain backend loaded successfully. */
export function isAvailable(): boolean {
  return available;
}

/** Reports whether the active backend supports Keychain enumeration. */
export function isListAvailable(): boolean {
  return available && backend.listSecrets !== undefined;
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
