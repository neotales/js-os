/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * ```ts
 * import { evalIsProcessElevated } from "./ffi_koffi.js";
 *
 * const elevated = evalIsProcessElevated();
 * ```
 */
export declare function evalIsProcessElevated(cache?: boolean): boolean;
