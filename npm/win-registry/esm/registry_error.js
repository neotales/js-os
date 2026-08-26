/**
 * The error type thrown by all Windows Registry operations.
 *
 * @example Usage
 * ```ts
 * import { Registry, RegistryError } from "@neotales/win-registry";
 *
 * try {
 *   using key = Registry.openKey("HKCU\\Software\\Missing");
 * } catch (error) {
 *   if (error instanceof RegistryError) {
 *     console.error(error.message);
 *   }
 * }
 * ```
 *
 * @module
 */
/**
 * Error type thrown by all Windows Registry operations, including key and
 * value manipulation, unsupported runtimes, and FFI backend failures.
 */
export class RegistryError extends Error {
    /**
     * Creates a new {@linkcode RegistryError}.
     *
     * @param message The error message.
     * @param options Optional error options, such as `cause`.
     */
    constructor(message, options) {
        super(message, options);
        this.name = "RegistryError";
    }
    /**
     * Throws a {@linkcode RegistryError} indicating that registry operations are
     * unsupported on the current platform or runtime.
     *
     * @throws {RegistryError} Always throws.
     *
     * @internal
     */
    static throwUnsupported() {
        throw new RegistryError("Registry is not supported on this platform or runtime. Node.js users without native FFI support should install @neotales/win-registry from npm, which includes a koffi fallback.");
    }
}
