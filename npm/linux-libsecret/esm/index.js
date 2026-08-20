/**
 * Linux libsecret helpers for storing and retrieving secrets.
 *
 * @example Usage
 * ```ts
 * import { isLinuxLibsecretAvailable, saveSecret } from "@neotales/linux-libsecret";
 *
 * if (isLinuxLibsecretAvailable()) {
 *   saveSecret("my-service", "my-account", "my-secret");
 * }
 * ```
 *
 * @module
 */
export { getSecretBytes, isLibsecretAvailable as isLinuxLibsecretAvailable, listSecrets, readSecret, removeSecret, saveSecret, } from "./vault.js";
