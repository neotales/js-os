/**
 * Shared keychain types.
 *
 * @module @neotales/darwin-keychain/ffi
 */

/**
 * Secret record returned by keychain listing operations.
 *
 * @example
 * import type { SecretRecord } from "@neotales/darwin-keychain";
 *
 * const record: SecretRecord = { service: "service", account: "account", secret: new Uint8Array() };
 */
export interface SecretRecord {
  /** Keychain service name. */
  service: string;
  /** Keychain account name. */
  account: string;
  /** Opaque secret bytes. */
  secret: Uint8Array;
}

/** Runtime that owns a native Keychain pointer. */
export type KeychainRuntime = "deno" | "node" | "bun" | "koffi";

/**
 * Opaque Security.framework reference.
 *
 * The pointer remains private so it cannot accidentally be passed to a
 * different runtime's FFI implementation. {@link valueOf} returns it only for
 * native FFI operations in the owning runtime.
 */
export class KeychainHandle {
  #pointer: unknown;

  constructor(readonly runtime: KeychainRuntime, pointer: unknown) {
    this.#pointer = pointer;
  }

  valueOf(): unknown {
    return this.#pointer;
  }
}

/** Generic-password lookup result with an owned item reference. */
export interface GenericPassword {
  /** Item reference; release it with `Security.CFRelease`. */
  item: KeychainHandle;
  /** Copied generic-password bytes. */
  secret: Uint8Array;
}

/** Internal backend contract implemented by runtime-specific keychain backends. */
export interface DarwinKeychainBackend {
  /** Reads a generic-password secret as bytes. */
  getSecretBytes(service: string, account: string): Uint8Array | null;
  /** Saves a generic-password secret as bytes. */
  saveSecretBytes(service: string, account: string, secret: Uint8Array): void;
  /** Removes a generic-password secret. */
  removeSecret(service: string, account: string): boolean;
  /** Lists generic-password secrets for a service when supported. */
  listSecrets?: (service: string) => SecretRecord[];
}

/** Whether the current runtime is macOS. */
export const DARWIN = (typeof globalThis.Deno !== "undefined" && Deno.build.os === "darwin") ||
  (typeof globalThis.process !== "undefined" && process.platform === "darwin");
