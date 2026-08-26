/**
 * Detects whether the current process is running with elevated privileges.
 *
 * @module @neotales/is-elevated
 */

type ElevationEvaluator = (cache?: boolean) => boolean;
let elevated: boolean | undefined;

function evalUnixElevation(cache = true): boolean {
  if (cache && elevated !== undefined)
    return elevated;

  let uid: number | null = null;
  if ("process" in globalThis) {
    if (process.geteuid)
      uid = process.geteuid();

    if (uid === null && process.getuid)
      uid = process.getuid();
  }

  elevated = uid === 0;
  return elevated;
}

function unsupportedNodeFfi(): never {
  throw new Error(
    "Unable to determine Windows process elevation because node:ffi is unavailable. Run Node.js >= 26 with --experimental-ffi, or use the npm package @neotales/is-elevated for its koffi fallback. See https://github.com/neotales/js-os/blob/dev/jsr/is-elevated/README.md#nodejs-ffi",
  );
}

function unsupportedRuntimeFfi(): never {
  throw new Error(
    "Unable to determine Windows process elevation because the runtime FFI backend is unavailable. Run Deno with --allow-ffi. See https://github.com/neotales/js-os/blob/dev/jsr/is-elevated/README.md#runtime-support",
  );
}

let impl: ElevationEvaluator = evalUnixElevation;
let isSupported = "process" in globalThis;

if (isSupported && process.platform === "win32") {
  let isNode = false;
  try {
    if ("Deno" in globalThis) {
      impl = (await import("./ffi_deno.ts")).evalIsProcessElevated;
    } else if ("Bun" in globalThis) {
      impl = (await import("./ffi_bun.ts")).evalIsProcessElevated;
    } else {
      isNode = true;
      impl = (await import("./ffi_node.ts")).evalIsProcessElevated;
    }

    // Loading a backend alone does not prove FFI permissions and native
    // libraries are usable, so evaluate once before advertising support.
    impl();
    isSupported = true;
  } catch (error) {
    if (process.env.DEBUG === "true")
      console.debug(error);

    impl = isNode ? unsupportedNodeFfi : unsupportedRuntimeFfi;
  }
}

/**
 * Returns whether elevation detection is available in the current runtime.
 *
 * @returns `true` when {@linkcode isElevated} can evaluate the current process.
 */
export function isElevatedAvailable(): boolean {
  return isSupported;
}

/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @throws {Error} On Windows when the runtime has no usable FFI backend.
 * @example
 * import { isElevated } from "jsr:@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
