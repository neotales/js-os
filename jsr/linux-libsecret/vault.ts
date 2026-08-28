/** Linux libsecret vault helpers. @module @neotales/linux-libsecret */

import {
  isLinuxKeyringAvailable,
  Libsecret,
  LibsecretErrorHandle,
  listSecretRecords,
  type SecretSchemaHandle,
} from "./ffi.ts";
import type { SecretRecord } from "./types.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
let schema: SecretSchemaHandle | null = null;

function validatePart(name: string, value: string): void {
  if (!value)
    throw new RangeError(`${name} must not be empty.`);
}

function getSchema(): SecretSchemaHandle {
  if (schema !== null)
    return schema;
  const terminator = null;
  const value = Libsecret.secretSchemaNew(
    "org.freedesktop.Secret.Generic",
    0,
    "service",
    0,
    "account",
    0,
    terminator,
  );
  if (value === null)
    throw new Error("Failed to create libsecret schema.");
  schema = value;
  return value;
}

/**
 * Returns whether libsecret is available in the current runtime.
 *
 * @returns `true` when Linux keyring operations are supported.
 * @example
 * ```ts
 * import { isAvailable } from "@neotales/linux-libsecret";
 *
 * if (isAvailable()) console.log("Linux keyring is available");
 * ```
 */
export function isAvailable(): boolean {
  return isLinuxKeyringAvailable();
}

/**
 * Reads a stored secret as raw bytes.
 *
 * @param service Keyring service name.
 * @param account Keyring account name.
 * @returns Stored secret bytes, or `null` when missing.
 * @example
 * ```ts
 * import { getSecret } from "@neotales/linux-libsecret";
 *
 * const secret = getSecret("service", "account");
 * ```
 */
export function getSecret(service: string, account: string): Uint8Array | null {
  validatePart("service", service);
  validatePart("account", account);
  if (!isAvailable())
    return null;
  const cancellable = null;
  const terminator = null;
  const errorOut = new LibsecretErrorHandle();
  const password = Libsecret.secretPasswordLookupSync(
    getSchema(),
    cancellable,
    errorOut,
    "service",
    service,
    "account",
    account,
    terminator,
  );
  const error = errorOut.error();
  if (error !== null)
    throw error;
  if (password === null)
    return null;
  try {
    return encoder.encode(password.text());
  } finally {
    Libsecret.secretPasswordFree(password);
  }
}

/**
 * Reads and decodes a stored secret.
 *
 * @param service Keyring service name.
 * @param account Keyring account name.
 * @returns Decoded secret text, or `null` when missing.
 * @example
 * ```ts
 * import { getSecretString } from "@neotales/linux-libsecret";
 *
 * const secret = getSecretString("service", "account");
 * ```
 */
export function getSecretString(service: string, account: string): string | null {
  const secret = getSecret(service, account);
  return secret === null ? null : decoder.decode(secret);
}

/**
 * Stores or updates a generic libsecret record.
 *
 * @param service Keyring service name.
 * @param account Keyring account name.
 * @param secret Secret text or bytes.
 * @returns Nothing.
 * @example
 * ```ts
 * import { saveSecret } from "@neotales/linux-libsecret";
 *
 * saveSecret("service", "account", "secret");
 * ```
 */
export function saveSecret(service: string, account: string, secret: string | Uint8Array): void {
  validatePart("service", service);
  validatePart("account", account);
  if (!isAvailable())
    return;
  const cancellable = null;
  const terminator = null;
  const errorOut = new LibsecretErrorHandle();
  const stored = Libsecret.secretPasswordStoreSync(
    getSchema(),
    "default",
    `${service}/${account}`,
    typeof secret === "string" ? secret : decoder.decode(secret),
    cancellable,
    errorOut,
    "service",
    service,
    "account",
    account,
    terminator,
  );
  const error = errorOut.error();
  if (error !== null)
    throw error;
  if (!stored)
    throw new Error("Failed to store secret.");
}

/**
 * Deletes a generic libsecret record.
 *
 * @param service Keyring service name.
 * @param account Keyring account name.
 * @returns `true` when a record was deleted.
 * @example
 * ```ts
 * import { removeSecret } from "@neotales/linux-libsecret";
 *
 * removeSecret("service", "account");
 * ```
 */
export function removeSecret(service: string, account: string): boolean {
  validatePart("service", service);
  validatePart("account", account);
  if (!isAvailable())
    return false;
  const cancellable = null;
  const terminator = null;
  const errorOut = new LibsecretErrorHandle();
  const cleared = Libsecret.secretPasswordClearSync(
    getSchema(),
    cancellable,
    errorOut,
    "service",
    service,
    "account",
    account,
    terminator,
  );
  const error = errorOut.error();
  if (error !== null)
    throw error;
  return cleared;
}

/**
 * Lists records for a keyring service.
 *
 * @param service Keyring service name.
 * @returns Matching records with copied secret bytes.
 * @example
 * ```ts
 * import { listSecrets } from "@neotales/linux-libsecret";
 *
 * const records = listSecrets("service");
 * ```
 */
export function listSecrets(service: string): SecretRecord[] {
  validatePart("service", service);
  if (!isAvailable())
    return [];
  return listSecretRecords(service);
}
