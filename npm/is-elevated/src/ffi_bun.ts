/// <reference types="@types/bun" />
import { dlopen, FFIType, ptr } from "bun:ffi";

let elevated: boolean | undefined;

/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * ```ts
 * import { evalIsProcessElevated } from "./ffi_bun.js";
 *
 * const elevated = evalIsProcessElevated();
 * ```
 */
export function evalIsProcessElevated(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }

  elevated = (globalThis.process as { getuid?: () => number } | undefined)?.getuid?.() === 0;
  if (!(globalThis as { Bun?: unknown }).Bun) {
    return elevated;
  }

  if ((globalThis.process as { platform?: string } | undefined)?.platform !== "win32") {
    return elevated;
  }

  const advapi32 = dlopen("Advapi32.dll", {
    OpenProcessToken: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.bool },
    GetTokenInformation: {
      args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr],
      returns: FFIType.bool,
    },
  });
  const kernel32 = dlopen("Kernel32.dll", {
    GetCurrentProcess: { args: [], returns: FFIType.ptr },
    CloseHandle: { args: [FFIType.ptr], returns: FFIType.bool },
    GetLastError: { args: [], returns: FFIType.i32 },
  });

  const TOKEN_QUERY = 0x0008;
  const TOKEN_ELEVATION = 20;
  const processHandle = kernel32.symbols.GetCurrentProcess();
  const tokenHandle = new BigUint64Array(1);
  const tokenHandlePtr = ptr(tokenHandle);

  const success = advapi32.symbols.OpenProcessToken(processHandle, TOKEN_QUERY, tokenHandlePtr);
  if (!success) throw new Error("Failed to open process token");

  try {
    const tokenInfo = new Uint8Array(4);
    const returnLength = new Uint32Array(1);
    const result = advapi32.symbols.GetTokenInformation(
      tokenHandle[0],
      TOKEN_ELEVATION,
      ptr(tokenInfo),
      4,
      ptr(returnLength),
    );
    if (!result)
      throw new Error(`Failed to get token information ${kernel32.symbols.GetLastError()}`);
    elevated = tokenInfo[0] !== 0;
    return elevated;
  } finally {
    kernel32.symbols.CloseHandle(tokenHandlePtr);
  }
}
