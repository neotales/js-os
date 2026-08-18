import process from "node:process";

let elevated: boolean | undefined;

/** Detects elevation from the effective user ID, or the real user ID when unavailable. */
export function evalIsProcessElevated(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  const uid = process.geteuid?.() ?? process.getuid?.();
  elevated = uid === 0;
  return elevated;
}
