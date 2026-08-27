/** Native macOS Keychain API. @module @neotales/darwin-keychain/ffi */
import { DARWIN, KeychainHandle as KeychainHandleValue } from "./types.js";
let unavailableReason = "macOS Keychain is only available on macOS.";
const unavailableBackend = {
    getSecretBytes() {
        return unavailable();
    },
    saveSecretBytes() {
        unavailable();
    },
    removeSecret() {
        return unavailable();
    },
    listSecrets() {
        return unavailable();
    },
};
let backend = unavailableBackend;
let available = false;
let runtime = "node";
if (DARWIN) {
    try {
        if ("Deno" in globalThis) {
            backend = (await import("./ffi_deno.js")).backend;
            runtime = "deno";
        }
        else if ("Bun" in globalThis) {
            backend = (await import("./ffi_bun.js")).backend;
            runtime = "bun";
        }
        else {
            try {
                backend = (await import("./ffi_node.js")).backend;
                runtime = "node";
            }
            catch {
                backend = (await import("./ffi_koffi.js")).backend;
                runtime = "koffi";
            }
        }
        available = true;
    }
    catch (error) {
        unavailableReason = error instanceof Error
            ? `${error.message}. Run Node.js >= 26 with --experimental-ffi, or install koffi with npm install koffi.`
            : String(error);
    }
}
function unavailable() {
    throw new Error(unavailableReason);
}
/** Reports whether the native Keychain backend loaded successfully. */
export function isAvailable() {
    return available;
}
/** Byte-oriented native generic-password operations. */
export const DarwinKeychain = {
    getSecretBytes(service, account) {
        return backend.getSecretBytes(service, account);
    },
    saveSecretBytes(service, account, secret) {
        backend.saveSecretBytes(service, account, secret);
    },
    removeSecret(service, account) {
        return backend.removeSecret(service, account);
    },
    listSecrets(service) {
        if (backend.listSecrets === undefined)
            throw new Error("Keychain enumeration is unavailable in this runtime.");
        return backend.listSecrets(service);
    },
};
function itemPointer(handle) {
    if (handle.runtime !== runtime)
        throw new TypeError("Keychain handle belongs to a different runtime.");
    const pointer = handle.valueOf();
    if (!pointer || typeof pointer !== "object" || !("service" in pointer) || !("account" in pointer))
        throw new TypeError("Invalid Keychain item handle.");
    return pointer;
}
function searchPointer(handle) {
    if (handle.runtime !== runtime)
        throw new TypeError("Keychain handle belongs to a different runtime.");
    const pointer = handle.valueOf();
    if (!pointer || typeof pointer !== "object" || !("records" in pointer) || !("index" in pointer))
        throw new TypeError("Invalid Keychain search handle.");
    return pointer;
}
/**
 * Security.framework-style operations using opaque handles.
 *
 * The selected runtime backend owns the native pointers and releases temporary
 * FFI allocations before returning. Handles retain the portable item or search
 * state needed to compose subsequent Keychain operations.
 */
export const Security = {
    SecKeychainFindGenericPassword(service, account) {
        const secret = backend.getSecretBytes(service, account);
        return secret === null
            ? null
            : { item: new KeychainHandleValue(runtime, { service, account }), secret };
    },
    SecKeychainAddGenericPassword(service, account, secret) {
        backend.saveSecretBytes(service, account, secret);
        return new KeychainHandleValue(runtime, { service, account });
    },
    SecKeychainItemModifyAttributesAndData(item, secret) {
        const pointer = itemPointer(item);
        backend.saveSecretBytes(pointer.service, pointer.account, secret);
    },
    SecKeychainItemDelete(item) {
        const pointer = itemPointer(item);
        if (!backend.removeSecret(pointer.service, pointer.account))
            throw new Error("SecKeychainItemDelete could not find the item.");
    },
    SecKeychainSearchCreateFromAttributes(service) {
        if (backend.listSecrets === undefined)
            throw new Error("Keychain enumeration is unavailable in this runtime.");
        return new KeychainHandleValue(runtime, {
            service,
            records: backend.listSecrets(service),
            index: 0,
        });
    },
    SecKeychainSearchCopyNext(search) {
        const pointer = searchPointer(search);
        const record = pointer.records[pointer.index++];
        return record === undefined
            ? null
            : new KeychainHandleValue(runtime, { service: record.service, account: record.account });
    },
    SecKeychainItemCopyAttributesAndData(item, service) {
        const pointer = itemPointer(item);
        if (pointer.service !== service)
            throw new RangeError("Item handle does not belong to the requested service.");
        const secret = backend.getSecretBytes(service, pointer.account);
        return secret === null ? null : { service, account: pointer.account, secret };
    },
    CFRelease(handle) {
        if (handle.runtime !== runtime)
            throw new TypeError("Keychain handle belongs to a different runtime.");
    },
};
export { DARWIN, KeychainHandle, } from "./types.js";
