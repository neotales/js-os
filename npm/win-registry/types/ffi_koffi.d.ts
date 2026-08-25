/**
 * Node.js FFI backend for Windows Registry operations using Koffi.
 *
 * @module
 * @internal
 */
import type { RegistryBackend } from "./types.js";
/**
 * The Koffi implementation of the {@linkcode RegistryBackend} contract, backed
 * by `advapi32.dll`.
 *
 * @example Usage
 * ```ts
 * import { backend } from "@neotales/win-registry/dist/ffi_koffi.js";
 * import { HKEY_CURRENT_USER } from "@neotales/win-registry";
 *
 * const handle = backend.openKey(HKEY_CURRENT_USER, "Software", 0x20019);
 * console.log(handle);
 * backend.closeKey(handle);
 * ```
 */
export declare const backend: RegistryBackend;
