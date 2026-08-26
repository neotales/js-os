import process from "node:process";

type ElevationEvaluator = (cache?: boolean) => boolean;

let elevated: boolean | undefined;

function evalUnixElevation(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  const uid = process.geteuid?.() ?? process.getuid?.();
  elevated = uid === 0;
  return elevated;
}

const runtime = globalThis as { Bun?: unknown; Deno?: unknown };
const isWindows = process.platform === "win32";

function unsupportedNodeFfi(): never {
  throw new Error(
    "Unable to determine Windows process elevation because neither node:ffi nor koffi is available. Run Node.js >= 26 with --experimental-ffi, or install koffi with npm install koffi. See https://github.com/neotales/js-os/blob/dev/npm/is-elevated/README.md#nodejs-ffi",
  );
}

function unsupportedRuntimeFfi(): never {
  throw new Error(
    "Unable to determine Windows process elevation because the runtime FFI backend is unavailable. Run Deno with --allow-ffi. See https://github.com/neotales/js-os/blob/dev/npm/is-elevated/README.md#runtime-support",
  );
}

let impl: ElevationEvaluator = evalUnixElevation;
let isSupported = !isWindows;

if (isWindows) {
  try {
    if (runtime.Deno) {
      impl = (await import("./ffi_deno.js")).evalIsProcessElevated;
    } else if (runtime.Bun) {
      impl = (await import("./ffi_bun.js")).evalIsProcessElevated;
    } else {
      try {
        impl = (await import("./ffi_node.js")).evalIsProcessElevated;
      } catch {
        impl = (await import("./ffi_koffi.js")).evalIsProcessElevated;
      }
    }

    // A backend import can succeed while FFI permissions or DLL loading fail.
    // Probe it once before exposing a supported evaluator.
    impl();
    isSupported = true;
  } catch (error) {
    if (process.env.DEBUG === "true")
      console.debug(error);
    impl = runtime.Deno || runtime.Bun ? unsupportedRuntimeFfi : unsupportedNodeFfi;
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
 * import { isElevated } from "@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
