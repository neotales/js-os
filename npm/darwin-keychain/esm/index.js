/**
 * macOS keychain helpers for generic passwords.
 *
 * @example Usage
 * ```ts
 * import { isDarwinKeychainAvailable, readSecret, saveSecret } from "@neotales/darwin-keychain";
 *
 * if (isDarwinKeychainAvailable()) {
 *   saveSecret("my-service", "my-account", "my-secret");
 * }
 * ```
 *
 * @module
 */
export { getSecretBytes, isDarwinKeychainAvailable, listSecrets, readSecret, removeSecret, saveSecret, } from "./vault.js";
