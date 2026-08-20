import type { LinuxKeyringBackend, SecretRecord } from "./types.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

let isSupported = false;

let driver: LinuxKeyringBackend = {
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

if (Deno.build.os === "linux") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and loadable libsecret dependencies.
  }
}

/**
 * Returns whether a libsecret backend is available in the current runtime.
 *
 * @returns `true` when libsecret operations are supported.
 */
export function isLibsecretAvailable(): boolean {
  return isSupported;
}

/** Reads and decodes a stored secret. */
export function readSecret(service: string, account: string): string | null {
  const bytes = driver.getSecretBytes(service, account);
  return bytes === null ? null : decoder.decode(bytes);
}

/** Reads a stored secret as raw bytes. */
export function getSecretBytes(service: string, account: string): Uint8Array | null {
  return driver.getSecretBytes(service, account);
}

/** Stores or updates a secret. */
export function saveSecret(service: string, account: string, secret: string | Uint8Array): void {
  driver.setSecretBytes(
    service,
    account,
    typeof secret === "string" ? encoder.encode(secret) : secret,
  );
}

/** Deletes a secret. */
export function removeSecret(service: string, account: string): boolean {
  return driver.deleteSecret(service, account);
}

/** Lists secrets for a service when the backend supports enumeration. */
export function listSecrets(service: string): SecretRecord[] {
  if (driver.list === undefined) {
    throw new Error("linux-libsecret list is not supported by this runtime backend");
  }
  return driver.list(service);
}
