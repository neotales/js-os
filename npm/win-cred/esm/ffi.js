/** Native Windows Credential Manager API. @module @neotales/win-cred/ffi */
import { WINDOWS } from "./types.js";
let unavailableReason = "Windows Credential Manager is only available on Windows.";
const unavailableWinCred = {
    write() {
        throw new Error(unavailableReason);
    },
    read() {
        throw new Error(unavailableReason);
    },
    delete() {
        throw new Error(unavailableReason);
    },
    enumerate() {
        throw new Error(unavailableReason);
    },
};
let WinCred = unavailableWinCred;
let available = false;
if (WINDOWS) {
    try {
        if ("Deno" in globalThis) {
            WinCred = (await import("./ffi_deno.js")).backend;
        }
        else if ("Bun" in globalThis) {
            WinCred = (await import("./ffi_bun.js")).backend;
        }
        else {
            try {
                WinCred = (await import("./ffi_node.js")).backend;
            }
            catch {
                WinCred = (await import("./ffi_koffi.js")).backend;
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
/**
 * Reports whether the native backend loaded successfully.
 * @returns `true` when {@link WinCred} operations are available.
 * @example
 * ```ts
 * import { isAvailable } from "@neotales/win-cred/ffi";
 *
 * console.log(isAvailable());
 * ```
 */
export function isAvailable() {
    return available;
}
/** Raw Windows Credential Manager operations that throw when unavailable. */
export { WinCred };
export { CredEnumerateFlags, CredPersist, CredType, CredWriteFlags, } from "./types.js";
