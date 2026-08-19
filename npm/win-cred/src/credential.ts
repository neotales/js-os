import type { Credential, CredentialBackend, RawCredential } from "./types.js";
import { CredEnumerateFlags, CredPersist, CredType, CredWriteFlags } from "./types.js";

const globals = globalThis as typeof globalThis & {
  Deno?: unknown;
  Bun?: unknown;
  process?: {
    env?: Record<string, string | undefined>;
    platform?: string;
    getBuiltinModule?: (name: string) => unknown;
  };
};

let isSupported = false;

let driver: CredentialBackend = {
  write(_cred: RawCredential, _flags: number): void {
    return;
  },
  read(_targetName: string, _type: number): RawCredential | null {
    return null;
  },
  delete(_targetName: string, _type: number): boolean {
    return false;
  },
  enumerate(_filter: string | null, _flags: number): RawCredential[] {
    return [];
  },
};

if (globals.process?.platform === "win32" && globals.process.getBuiltinModule) {
  const { createRequire } = globals.process.getBuiltinModule(
    "node:module",
  ) as typeof import("node:module");
  const require = createRequire(import.meta.url);

  if (typeof globals.Deno !== "undefined") {
    driver = (require("./ffi_deno.js") as typeof import("./ffi_deno.js")).backend;
    isSupported = true;
  } else if (typeof globals.Bun !== "undefined") {
    driver = (require("./ffi_bun.js") as typeof import("./ffi_bun.js")).backend;
    isSupported = true;
  } else {
    try {
      if (globals.process.getBuiltinModule("node:ffi")) {
        driver = (require("./ffi_node.js") as typeof import("./ffi_node.js")).backend;
        isSupported = true;
      } else {
        driver = (require("./ffi_koffi.js") as typeof import("./ffi_koffi.js")).backend;
        isSupported = true;
      }
    } catch (error) {
      if (globals.process.env?.DEBUG === "true") {
        console.debug(error);
      }
    }
  }
}

function rawToCredential(raw: RawCredential): Credential {
  return {
    targetName: raw.targetName,
    type: raw.type as CredType,
    comment: raw.comment,
    credentialBlob: raw.credentialBlob,
    persist: raw.persist as CredPersist,
    targetAlias: raw.targetAlias,
    userName: raw.userName,
    lastWritten: raw.lastWritten,
    flags: raw.flags,
    attributeCount: raw.attributeCount,
  };
}

/**
 * Returns whether a Windows Credential Manager backend is available in the
 * current runtime.
 *
 * @returns `true` when credential operations are supported.
 */
export function isAvailable(): boolean {
  return isSupported;
}

/**
 * Encodes a secret string as UTF-16LE bytes for Windows Credential Manager.
 *
 * @param secret Secret string to encode.
 * @returns The UTF-16LE encoded bytes.
 */
export function encodeSecret(secret: string): Uint8Array {
  const buf = new Uint8Array(secret.length * 2);
  for (let i = 0; i < secret.length; i++) {
    const code = secret.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

/**
 * Decodes a UTF-16LE credential blob into a string.
 *
 * @param blob Encoded credential bytes.
 * @returns The decoded secret string.
 */
export function decodeSecret(blob: Uint8Array): string {
  const decoder = new TextDecoder("utf-16le");
  return decoder.decode(blob);
}

/** Options used when saving a credential. */
export interface WriteOptions {
  targetName: string;
  secret: Uint8Array | string;
  type?: CredType;
  persist?: CredPersist;
  userName?: string;
  comment?: string;
  flags?: CredWriteFlags;
}

/**
 * Saves or updates a credential in Windows Credential Manager.
 *
 * @example Usage
 * ```ts
 * import { saveCredential } from "@neotales/win-cred";
 *
 * saveCredential({ targetName: "myapp/token", secret: "secret" });
 * ```
 *
 * @param options Credential write options.
 */
export function saveCredential(options: WriteOptions): void {
  const blob = typeof options.secret === "string" ? encodeSecret(options.secret) : options.secret;
  driver.write(
    {
      flags: 0,
      type: options.type ?? CredType.GENERIC,
      targetName: options.targetName,
      comment: options.comment ?? "",
      lastWritten: 0n,
      credentialBlobSize: blob.length,
      credentialBlob: blob,
      persist: options.persist ?? CredPersist.LOCAL_MACHINE,
      attributeCount: 0,
      targetAlias: "",
      userName: options.userName ?? "",
    },
    options.flags ?? CredWriteFlags.NONE,
  );
}

/**
 * Reads a credential from Windows Credential Manager.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns The credential when found, otherwise `null`.
 */
export function readCredential(
  targetName: string,
  type: CredType = CredType.GENERIC,
): Credential | null {
  const raw = driver.read(targetName, type);
  return raw ? rawToCredential(raw) : null;
}

/**
 * Reads and decodes a credential secret as a string.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns The decoded secret string when found, otherwise `null`.
 */
export function readSecret(targetName: string, type: CredType = CredType.GENERIC): string | null {
  const cred = readCredential(targetName, type);
  return cred ? decodeSecret(cred.credentialBlob) : null;
}

/**
 * Removes a credential from Windows Credential Manager.
 *
 * @param targetName Credential target name.
 * @param type Credential type.
 * @returns `true` when a credential was removed.
 */
export function removeCredential(targetName: string, type: CredType = CredType.GENERIC): boolean {
  return driver.delete(targetName, type);
}

/**
 * Lists credentials available to the current user.
 *
 * @param filter Optional filter string.
 * @param flags Enumeration flags.
 * @returns The matching credentials.
 */
export function listCredentials(
  filter?: string | null,
  flags: CredEnumerateFlags = CredEnumerateFlags.NONE,
): Credential[] {
  return driver.enumerate(filter ?? null, flags).map(rawToCredential);
}
