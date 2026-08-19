/**
 * Shared types, enums, constants and backend interface for the Windows Credential Management module.
 *
 * @module
 */

export enum CredType {
  GENERIC = 1,
  DOMAIN_PASSWORD = 2,
  DOMAIN_CERTIFICATE = 3,
  DOMAIN_VISIBLE_PASSWORD = 4,
  GENERIC_CERTIFICATE = 5,
  DOMAIN_EXTENDED = 6,
  MAXIMUM = 7,
  MAXIMUM_EX = MAXIMUM + 1000,
}
/** Credential persistence options. */
export enum CredPersist {
  SESSION = 1,
  LOCAL_MACHINE = 2,
  ENTERPRISE = 3,
}
/** Flags accepted by credential write operations. */
export enum CredWriteFlags {
  NONE = 0,
  PRESERVE_CREDENTIAL_BLOB = 1,
}
/** Flags accepted by credential enumeration operations. */
export enum CredEnumerateFlags {
  NONE = 0,
  ALL_CREDENTIALS = 1,
}

/** Public credential shape returned by high-level helpers. */
export interface Credential {
  targetName: string;
  type: CredType;
  comment: string;
  credentialBlob: Uint8Array;
  persist: CredPersist;
  targetAlias: string;
  userName: string;
  lastWritten: bigint;
  flags: number;
  attributeCount: number;
}

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
  flags: number;
  type: number;
  targetName: string;
  comment: string;
  lastWritten: bigint;
  credentialBlobSize: number;
  credentialBlob: Uint8Array;
  persist: number;
  attributeCount: number;
  targetAlias: string;
  userName: string;
}

/** Internal backend contract implemented by runtime-specific FFI layers. */
export interface CredentialBackend {
  write(cred: RawCredential, flags: number): void;
  read(targetName: string, type: number): RawCredential | null;
  delete(targetName: string, type: number): boolean;
  enumerate(filter: string | null, flags: number): RawCredential[];
}
