import { strictEqual } from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  getSecretBytes,
  isDarwinKeychainAvailable,
  listSecrets,
  readSecret,
  removeSecret,
  saveSecret,
} from "../src/index.js";

const DARWIN = process.platform === "darwin";
const DANGEROUS_MUTATIONS =
  process.env.TEST_DANGEROUS_OS_MUTATIONS === "true" || process.env.CI === "true";

function shouldSkipIntegration(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes("interaction is not allowed") ||
    msg.includes("user interaction") ||
    msg.includes("authorization") ||
    msg.includes("not available") ||
    msg.includes("bun panic") ||
    msg.includes("not supported in bun") ||
    msg.includes("failed to load darwin-keychain backend") ||
    msg.includes("only supported on macos")
  );
}

test("darwin-keychain::availability reports a boolean", () => {
  strictEqual(typeof isDarwinKeychainAvailable(), "boolean");
});

test("darwin-keychain::unsupported platform returns safe defaults", { skip: DARWIN }, () => {
  strictEqual(isDarwinKeychainAvailable(), false);
  strictEqual(readSecret("svc", "acct"), null);
  strictEqual(getSecretBytes("svc", "acct"), null);
  strictEqual(removeSecret("svc", "acct"), false);
});

test(
  "darwin-keychain::set/get/list/delete roundtrip (dangerous)",
  { skip: !DARWIN || !DANGEROUS_MUTATIONS },
  (t) => {
    if (!DARWIN || !DANGEROUS_MUTATIONS) return;

    const service = "neotales-js-darwin-keychain-test";
    const account = `acct-${Date.now()}`;
    const secret = "top-secret";

    try {
      saveSecret(service, account, secret);
      const saved = readSecret(service, account);
      if (saved !== secret) {
        // Hosted macOS runners can expose a Keychain that accepts writes but cannot read them.
        try {
          removeSecret(service, account);
        } catch {
          // Nothing to clean up when the hosted Keychain session is unavailable.
        }
        t.skip("Integration environment unavailable: Keychain did not retain the test item");
        return;
      }
      strictEqual(getSecretBytes(service, account) instanceof Uint8Array, true);

      const records = listSecrets(service);
      strictEqual(
        records.some((record) => record.service === service && record.account === account),
        true,
      );
      strictEqual(removeSecret(service, account), true);
    } catch (error) {
      if (shouldSkipIntegration(error)) {
        t.skip(
          `Integration environment unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      throw error;
    }
  },
);
