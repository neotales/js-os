import type { SecretRecord } from "./types.js";
/**
 * Returns whether a libsecret backend is available in the current runtime.
 *
 * @returns `true` when libsecret operations are supported.
 */
export declare function isLibsecretAvailable(): boolean;
/** Reads and decodes a stored secret. */
export declare function readSecret(service: string, account: string): string | null;
/** Reads a stored secret as raw bytes. */
export declare function getSecretBytes(service: string, account: string): Uint8Array | null;
/** Stores or updates a secret. */
export declare function saveSecret(service: string, account: string, secret: string | Uint8Array): void;
/** Deletes a secret. */
export declare function removeSecret(service: string, account: string): boolean;
/** Lists secrets for a service when the backend supports enumeration. */
export declare function listSecrets(service: string): SecretRecord[];
