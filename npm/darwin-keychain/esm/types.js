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
 */
export class KeychainHandle {
    runtime;
    #pointer;
    constructor(runtime, pointer) {
        this.runtime = runtime;
        this.#pointer = pointer;
    }
    valueOf() {
        return this.#pointer;
    }
}
const runtime = globalThis;
/** Whether the current runtime is macOS. */
export const DARWIN = runtime.Deno?.build.os === "darwin" || runtime.process?.platform === "darwin";
