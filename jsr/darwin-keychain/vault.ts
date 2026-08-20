/**
 * macOS keychain vault helpers.
 *
 * @module @neotales/darwin-keychain
 */

import type { DarwinKeychainBackend, SecretRecord } from "./types.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

let isSupported = false;

let driver: DarwinKeychainBackend = {
  getSecretBytes(_service: string, _account: string): Uint8Array | null {
    return null;
  },
  setSecretBytes(_service: string, _account: string, _secret: Uint8Array): void {
    return;
  },
  deleteSecret(_service: string, _account: string): boolean {
    return false;
  },
};

if (Deno.build.os === "darwin") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and a loadable Security.framework backend.
  }
}

/**
 * Returns whether a macOS keychain backend is available in the current runtime.
 *
 * @returns `true` when generic password operations are supported.
 * @example
 * if (isDarwinKeychainAvailable()) console.log("Keychain is available");
 */
export function isDarwinKeychainAvailable(): boolean {
  return isSupported;
}

/**
 * Reads and decodes a stored secret.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret string, or `null` when missing.
 * @example
 * const secret = readSecret("service", "account");
 */
export function readSecret(service: string, account: string): string | null {
  const bytes = driver.getSecretBytes(service, account);
  return bytes === null ? null : decoder.decode(bytes);
}

/**
 * Reads a stored secret as raw bytes.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns The stored secret bytes, or `null` when missing.
 * @example
 * const bytes = getSecretBytes("service", "account");
 */
export function getSecretBytes(service: string, account: string): Uint8Array | null {
  return driver.getSecretBytes(service, account);
}

/**
 * Stores or updates a generic password record.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @param secret Secret string or bytes.
 * @returns Nothing.
 * @example
 * saveSecret("service", "account", "secret");
 */
export function saveSecret(service: string, account: string, secret: string | Uint8Array): void {
  driver.setSecretBytes(
    service,
    account,
    typeof secret === "string" ? encoder.encode(secret) : secret,
  );
}

/**
 * Deletes a generic password record.
 *
 * @param service Keychain service name.
 * @param account Keychain account name.
 * @returns `true` when a record was deleted.
 * @example
 * removeSecret("service", "account");
 */
export function removeSecret(service: string, account: string): boolean {
  return driver.deleteSecret(service, account);
}

/**
 * Lists records for a service when the backend supports enumeration.
 *
 * Bun currently does not support keychain listing here because the FFI-based
 * implementation panics while enumerating Security.framework results.
 *
 * @param service Keychain service name.
 * @returns Decoded records for the given service.
 * @example
 * const records = listSecrets("service");
 */
export function listSecrets(
  service: string,
): Array<{ service: string; account: string; secret: string }> {
  if (driver.list === undefined) {
    throw new Error(
      "darwin-keychain list is not supported in Bun right now because it triggers a Bun panic; other unsupported runtimes also omit list support",
    );
  }

  const records: SecretRecord[] = driver.list(service);
  return records.map((record) => ({
    service: record.service,
    account: record.account,
    secret: decoder.decode(record.secret),
  }));
}
