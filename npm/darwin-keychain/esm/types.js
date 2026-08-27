/**
 * darwin-keychain types module.
 *
 * @module @neotales/darwin-keychain/ffi
 */
/**
 * Opaque Security.framework reference.
 *
 * The pointer remains private so it cannot accidentally be passed to a
 * different runtime's FFI implementation. {@link valueOf} returns it only for
 * native FFI operations in the owning runtime.
 *
 * @example
 * ```ts
 * import { KeychainHandle } from "@neotales/darwin-keychain/ffi";
 *
 * const handle = new KeychainHandle("bun", 0);
 * ```
 */
export class KeychainHandle {
    runtime;
    #pointer;
    /**
     * Creates a handle for a runtime-owned native reference.
     *
     * @param runtime Runtime that created the reference.
     * @param pointer Private native reference.
     * @example
     * ```ts
     * import { KeychainHandle } from "@neotales/darwin-keychain/ffi";
     *
     * const handle = new KeychainHandle("bun", 0);
     * ```
     */
    constructor(runtime, pointer) {
        this.runtime = runtime;
        this.#pointer = pointer;
    }
    /**
     * Returns the private runtime-owned reference for FFI use.
     *
     * @returns The underlying reference.
     * @example
     * ```ts
     * import { KeychainHandle } from "@neotales/darwin-keychain/ffi";
     *
     * const pointer = new KeychainHandle("bun", 0).valueOf();
     * ```
     */
    valueOf() {
        return this.#pointer;
    }
}
/**
 * Whether the current runtime is macOS.
 *
 * @returns `true` when the runtime is executing on macOS.
 * @example
 * ```ts
 * import { DARWIN } from "@neotales/darwin-keychain/ffi";
 *
 * if (DARWIN) console.log("macOS runtime");
 * ```
 */
export const DARWIN = typeof globalThis.process !== "undefined" &&
    process.platform === "darwin";
