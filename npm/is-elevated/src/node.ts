import process from "node:process";

let elevated: boolean | undefined;

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
export function evalIsProcessElevated(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  const uid = process.geteuid?.() ?? process.getuid?.();
  elevated = uid === 0;
  return elevated;
}
