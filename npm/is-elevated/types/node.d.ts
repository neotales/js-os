/**
 * Reports whether the current process has an effective user ID of zero.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has an effective user ID of zero.
 * @example
 * import { evalIsProcessElevated } from "./node.js";
 *
 * const elevated = evalIsProcessElevated();
 */
export declare function evalIsProcessElevated(cache?: boolean): boolean;
