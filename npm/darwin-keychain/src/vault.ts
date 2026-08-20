/**
 * darwin-keychain vault module.
 *
 * @module @neotales/darwin-keychain
 */

import type { DarwinKeychainBackend, SecretRecord } from "./types.js";

const globals = globalThis as typeof globalThis & {
  Deno?: unknown;
  Bun?: unknown;
  process?: {
    env?: Record<string, string | undefined>;
    platform?: string;
    getBuiltinModule?: (name: string) => unknown;
  };
};

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

if (globals.process?.platform === "darwin" && globals.process.getBuiltinModule) {
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
