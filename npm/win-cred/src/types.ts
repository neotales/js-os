/**
 * Shared types, enums, constants and backend interface for the Windows Credential Management module.
 *
 * @module
 */

export enum CredType {
  /** Generic application credential. */
  GENERIC = 1,
  /** Domain password credential. */
  DOMAIN_PASSWORD = 2,
  /** Domain certificate credential. */
  DOMAIN_CERTIFICATE = 3,
  /** Domain credential visible to the user. */
  DOMAIN_VISIBLE_PASSWORD = 4,
  /** Generic certificate credential. */
  GENERIC_CERTIFICATE = 5,
  /** Extended domain credential. */
  DOMAIN_EXTENDED = 6,
  /** Highest defined standard credential type. */
  MAXIMUM = 7,
  /** Reserved range beginning after standard types. */
  MAXIMUM_EX = MAXIMUM + 1000,
}
/** Credential persistence options. */
export enum CredPersist {
  /** Retain the credential for the current logon session only. */
  SESSION = 1,
  /** Retain the credential on the local computer. */
  LOCAL_MACHINE = 2,
  /** Retain the credential for the user across domain computers. */
  ENTERPRISE = 3,
}
/** Flags accepted by credential write operations. */
export enum CredWriteFlags {
  /** Write all supplied fields. */
  NONE = 0,
  /** Preserve the existing credential blob. */
  PRESERVE_CREDENTIAL_BLOB = 1,
}
/** Flags accepted by credential enumeration operations. */
export enum CredEnumerateFlags {
  /** Interpret the filter as a target-name pattern. */
  NONE = 0,
  /** Enumerate every credential, ignoring the filter. */
  ALL_CREDENTIALS = 1,
}

/** Public credential shape returned by high-level helpers. */
export interface Credential {
  /** Credential target name. */ targetName: string;
  /** Credential type. */ type: CredType;
  /** Application comment. */ comment: string;
  /** Opaque credential bytes. */ credentialBlob: Uint8Array;
  /** Credential persistence scope. */ persist: CredPersist;
  /** Target alias. */ targetAlias: string;
  /** Associated user name. */ userName: string;
  /** Windows FILETIME write timestamp. */ lastWritten: bigint;
  /** Native credential flags. */ flags: number;
  /** Number of native attributes. */ attributeCount: number;
}

/** A secret stored under a service and account pair. */
export interface SecretRecord {
  /** Service namespace. */ service: string;
  /** Account identifier. */ account: string;
  /** Opaque secret bytes. */ secret: Uint8Array;
}

/** Whether the current runtime is Windows. */
const runtime = globalThis as {
  Deno?: { build: { os: string } };
  process?: { platform?: string };
};
export const WINDOWS = runtime.Deno?.build.os === "windows" ||
  runtime.process?.platform === "win32";

/**
 * Encodes a string as a null-terminated UTF-16LE buffer.
 *
 * @param str String to encode.
 * @returns The encoded UTF-16LE buffer.
 */
export function stringToWide(str: string): Uint8Array {
  const buf = new Uint8Array((str.length + 1) * 2);

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }

  return buf;
}

/**
 * Decodes a UTF-16LE buffer up to the first null terminator.
 *
 * @param buffer Encoded UTF-16LE buffer.
 * @param byteLength Optional byte length to decode.
 * @returns The decoded string.
 */
export function wideToString(buffer: Uint8Array, byteLength?: number): string {
  const len = byteLength ?? buffer.length;
  const decoder = new TextDecoder("utf-16le");
  let end = len;

  for (let i = 0; i < len - 1; i += 2) {
    if (buffer[i] === 0 && buffer[i + 1] === 0) {
      end = i;
      break;
    }
  }

  return decoder.decode(buffer.subarray(0, end));
}

/** Raw credential layout used by the runtime-specific backends. */
export interface RawCredential {
  /** Native credential flags. */ flags: number;
  /** Numeric credential type. */ type: number;
  /** Credential target name. */ targetName: string;
  /** Application comment. */ comment: string;
  /** Windows FILETIME write timestamp. */ lastWritten: bigint;
  /** Size of the credential blob in bytes. */ credentialBlobSize: number;
  /** Opaque credential bytes. */ credentialBlob: Uint8Array;
  /** Numeric persistence scope. */ persist: number;
  /** Number of native attributes. */ attributeCount: number;
  /** Target alias. */ targetAlias: string;
  /** Associated user name. */ userName: string;
}

/** Internal backend contract implemented by runtime-specific FFI layers. */
export interface WinCredentials {
  /**
   * Writes or updates a credential.
   * @param credential Raw credential data.
   * @param flags Native write flags.
   * @returns Nothing.
   * @throws {Error} If the backend is unavailable or Windows rejects the write.
   * @example
   * ```ts
   * import { WinCred } from "@neotales/win-cred/ffi";
   *
   * WinCred.write({} as never, 0);
   * ```
   */
  write(cred: RawCredential, flags: number): void;
  /**
   * Reads a credential by target and type.
   * @param targetName Credential target name.
   * @param type Credential type.
   * @returns The credential, or `null` when missing.
   * @throws {Error} If the backend is unavailable.
   * @example
   * ```ts
   * import { CredType, WinCred } from "@neotales/win-cred/ffi";
   *
   * const credential = WinCred.read("target", CredType.GENERIC);
   * ```
   */
  read(targetName: string, type: number): RawCredential | null;
  /**
   * Deletes a credential.
   * @param targetName Credential target name.
   * @param type Credential type.
   * @returns Whether a credential was deleted.
   * @throws {Error} If the backend is unavailable.
   * @example
   * ```ts
   * import { CredType, WinCred } from "@neotales/win-cred/ffi";
   *
   * WinCred.delete("target", CredType.GENERIC);
   * ```
   */
  delete(targetName: string, type: number): boolean;
  /**
   * Enumerates credentials.
   * @param filter Target-name pattern, or `null`.
   * @param flags Native enumeration flags.
   * @returns Matching credentials.
   * @throws {Error} If the backend is unavailable.
   * @example
   * ```ts
   * import { CredEnumerateFlags, WinCred } from "@neotales/win-cred/ffi";
   *
   * const credentials = WinCred.enumerate(null, CredEnumerateFlags.ALL_CREDENTIALS);
   * ```
   */
  enumerate(filter: string | null, flags: number): RawCredential[];
}
