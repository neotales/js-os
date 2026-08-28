/** Native Linux libsecret API. @module @neotales/linux-libsecret/ffi */
import { LINUX } from "./types.js";
let unavailableReason = "Linux libsecret is only available on Linux.";
function unavailable() {
    throw new Error(unavailableReason);
}
const unavailableBindings = {
    runtime: "node",
    secretSchemaNew() {
        return unavailable();
    },
    secretPasswordLookupSync() {
        return unavailable();
    },
    secretPasswordStoreSync() {
        return unavailable();
    },
    secretPasswordClearSync() {
        return unavailable();
    },
    secretPasswordFree() {
        unavailable();
    },
};
function gioUnavailable() {
    throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
}
const unavailableGio = {
    cancellableNew() {
        return gioUnavailable();
    },
    cancellableCancel() {
        gioUnavailable();
    },
    cancellableRelease() {
        gioUnavailable();
    },
};
let backend = unavailableBindings;
/**
 * Typed camelCase wrappers for the native libsecret functions.
 *
 * Native `GError**` outputs are represented by caller-created `LibsecretErrorHandle`
 * values. C string arguments and returned password text are JavaScript strings.
 *
 * @example
 * ```ts
 * import { isLinuxKeyringAvailable, Libsecret } from "@neotales/linux-libsecret/ffi";
 *
 * if (isLinuxKeyringAvailable()) {
 *   const schema = Libsecret.secretSchemaNew(
 *     "org.example.Secret",
 *     0,
 *     "service",
 *     0,
 *     "account",
 *     0,
 *     null,
 *   );
 * }
 * ```
 */
export let Libsecret = unavailableBindings;
/**
 * Typed optional GIO wrappers for creating, cancelling, and releasing `GCancellable` values.
 * Methods throw when GIO is unavailable; use `isGioAvailable` before calling them.
 *
 * @example
 * ```ts
 * import { Gio, isGioAvailable } from "@neotales/linux-libsecret/ffi";
 *
 * if (isGioAvailable()) {
 *   const cancellable = Gio.cancellableNew();
 *   Gio.cancellableRelease(cancellable);
 * }
 * ```
 */
export let Gio = unavailableGio;
/** Returns records through the optional runtime enumeration capability. @internal */
export function listSecretRecords(service) {
    if (backend.listSecretRecords === undefined)
        throw new Error("Linux keyring enumeration is unavailable in this runtime.");
    return backend.listSecretRecords(service);
}
let available = false;
let gioAvailable = false;
if (LINUX) {
    try {
        if ("Deno" in globalThis)
            backend = (await import("./ffi_deno.js")).backend;
        else if ("Bun" in globalThis)
            backend = (await import("./ffi_bun.js")).backend;
        else {
            try {
                backend = (await import("./ffi_node.js")).backend;
            }
            catch {
                backend = (await import("./ffi_koffi.js")).backend;
            }
        }
        Libsecret = backend;
        Gio = backend.gio ?? unavailableGio;
        available = true;
        gioAvailable = backend.gio !== undefined;
    }
    catch (error) {
        unavailableReason = error instanceof Error
            ? `${error.message}. Run Node.js >= 26 with --experimental-ffi, or install koffi with npm install koffi.`
            : String(error);
    }
}
/**
 * Reports whether the native Linux keyring backend loaded successfully.
 *
 * @returns `true` when libsecret can be used in the current runtime.
 * @example
 * ```ts
 * import { isLinuxKeyringAvailable } from "@neotales/linux-libsecret/ffi";
 *
 * if (isLinuxKeyringAvailable()) console.log("libsecret is available");
 * ```
 */
export function isLinuxKeyringAvailable() {
    return available;
}
/**
 * Reports whether optional GIO cancellation support loaded successfully.
 *
 * @returns `true` when `GCancellable` operations are available in the current runtime.
 * @example
 * ```ts
 * import { isGioAvailable } from "@neotales/linux-libsecret/ffi";
 *
 * if (isGioAvailable()) console.log("GIO cancellation is available");
 * ```
 */
export function isGioAvailable() {
    return gioAvailable;
}
export { GCancellableHandle, LibsecretErrorHandle, LINUX, SecretPasswordHandle, SecretSchemaHandle, } from "./types.js";
