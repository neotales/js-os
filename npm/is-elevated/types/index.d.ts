/**
 * Returns whether elevation detection is available in the current runtime.
 *
 * @returns `true` when {@linkcode isElevated} can evaluate the current process.
 */
export declare function isElevatedAvailable(): boolean;
/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @throws {Error} On Windows when the runtime has no usable FFI backend.
 * @example
 * import { isElevated } from "@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export declare function isElevated(cache?: boolean): boolean;
