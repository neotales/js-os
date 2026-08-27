/** Native Windows Credential Manager API. @module @neotales/win-cred/ffi */

import type { RawCredential, WinCredentials } from "./types.ts";
import { WINDOWS } from "./types.ts";

let unavailableReason =
  "Windows Credential API is only available on Windows for the NodeJs, Deno, and Bun runtimes.";
const unavailableWinCred: WinCredentials = {
  write(): void {
    throw new Error(unavailableReason);
  },
  read(): RawCredential | null {
    throw new Error(unavailableReason);
  },
  delete(): boolean {
    throw new Error(unavailableReason);
  },
  enumerate(): RawCredential[] {
    throw new Error(unavailableReason);
  },
};

let WinCred = unavailableWinCred;
let available = false;
if (WINDOWS) {
  try {
    if ("Deno" in globalThis)
      WinCred = (await import("./ffi_deno.ts")).backend;
    else if ("Bun" in globalThis)
      WinCred = (await import("./ffi_bun.ts")).backend;
    else
      WinCred = (await import("./ffi_node.ts")).backend;
    available = true;
  } catch (error) {
    unavailableReason = error instanceof Error ? error.message : String(error);
  }
}

/**
 * Reports whether the native backend loaded successfully.
 * @returns `true` when {@link WinCred} operations are available.
 * @example
 * ```ts
 * import { isWinCredAvailable } from "@neotales/win-cred/ffi";
 *
 * console.log(isWinCredAvailable());
 * ```
 */
export function isWinCredAvailable(): boolean {
  return available;
}

/** Raw Windows Credential Manager operations that throw when unavailable. */
export { WinCred };
export {
  type Credential,
  CredEnumerateFlags,
  CredPersist,
  CredType,
  CredWriteFlags,
  type RawCredential,
  type WinCredentials as CredentialBackend,
} from "./types.ts";
