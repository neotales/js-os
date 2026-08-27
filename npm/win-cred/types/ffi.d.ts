/** Native Windows Credential Manager API. @module @neotales/win-cred/ffi */
import type { WinCredentials } from "./types.js";
declare let WinCred: WinCredentials;
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
export declare function isAvailable(): boolean;
/** Raw Windows Credential Manager operations that throw when unavailable. */
export { WinCred };
export { type Credential, CredEnumerateFlags, CredPersist, CredType, CredWriteFlags, type RawCredential, type WinCredentials as CredentialBackend, } from "./types.js";
