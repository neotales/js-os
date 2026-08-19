/**
 * Windows Credential Manager helpers using runtime-specific FFI backends.
 *
 * @example Usage
 * ```ts
 * import { readSecret, saveCredential } from "@neotales/win-cred";
 *
 * saveCredential({ targetName: "myapp/token", secret: "secret" });
 * console.log(readSecret("myapp/token"));
 * ```
 *
 * @module
 */

export {
  decodeSecret,
  encodeSecret,
  isAvailable,
  listCredentials,
  readCredential,
  readSecret,
  removeCredential,
  saveCredential,
  type WriteOptions,
} from "./credential.js";
export {
  type Credential,
  type CredentialBackend,
  CredEnumerateFlags,
  CredPersist,
  CredType,
  CredWriteFlags,
  type RawCredential,
} from "./types.js";
