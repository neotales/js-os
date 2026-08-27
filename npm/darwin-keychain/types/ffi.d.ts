/** Native macOS Keychain API. @module @neotales/darwin-keychain/ffi */
import type { GenericPassword, KeychainHandle, SecretRecord } from "./types.js";
/** Reports whether the native Keychain backend loaded successfully. */
export declare function isAvailable(): boolean;
/** Reports whether the active backend supports Keychain enumeration. */
export declare function isListAvailable(): boolean;
/** Byte-oriented native generic-password operations. */
export declare const DarwinKeychain: {
    getSecretBytes(service: string, account: string): Uint8Array | null;
    saveSecretBytes(service: string, account: string, secret: Uint8Array): void;
    removeSecret(service: string, account: string): boolean;
    listSecrets(service: string): SecretRecord[];
};
/**
 * Security.framework-style operations using opaque handles.
 *
 * The selected runtime backend owns the native pointers and releases temporary
 * FFI allocations before returning. Handles retain the portable item or search
 * state needed to compose subsequent Keychain operations.
 */
export declare const Security: {
    SecKeychainFindGenericPassword(service: string, account: string): GenericPassword | null;
    SecKeychainAddGenericPassword(service: string, account: string, secret: Uint8Array): KeychainHandle;
    SecKeychainItemModifyAttributesAndData(item: KeychainHandle, secret: Uint8Array): void;
    SecKeychainItemDelete(item: KeychainHandle): void;
    SecKeychainSearchCreateFromAttributes(service: string): KeychainHandle;
    SecKeychainSearchCopyNext(search: KeychainHandle): KeychainHandle | null;
    SecKeychainItemCopyAttributesAndData(item: KeychainHandle, service: string): SecretRecord | null;
    CFRelease(handle: KeychainHandle): void;
};
export { DARWIN, type DarwinKeychainBackend, type GenericPassword, KeychainHandle, type KeychainRuntime, type SecretRecord, } from "./types.js";
