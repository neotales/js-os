import { strictEqual } from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  getSecretBytes,
  isLinuxLibsecretAvailable,
  listSecrets,
  readSecret,
  removeSecret,
  saveSecret,
} from "../src/index.js";

const LINUX = process.platform === "linux";
const DANGEROUS_MUTATIONS =
  process.env.TEST_DANGEROUS_OS_MUTATIONS === "true" || process.env.CI === "true";

function shouldSkipIntegration(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes("libsecret") ||
    msg.includes("only supported on linux") ||
    msg.includes("org.freedesktop") ||
    msg.includes("dbus") ||
    msg.includes("collection") ||
    msg.includes("unknown libsecret error")
  );
}

test("linux-libsecret::availability reports a boolean", () => {
  strictEqual(typeof isLinuxLibsecretAvailable(), "boolean");
});

test("linux-libsecret::unsupported platform returns safe defaults", { skip: LINUX }, () => {
  strictEqual(isLinuxLibsecretAvailable(), false);
  strictEqual(readSecret("svc", "acct"), null);
  strictEqual(getSecretBytes("svc", "acct"), null);
  strictEqual(removeSecret("svc", "acct"), false);
});

test(
  "linux-libsecret::set/get/list/delete roundtrip (dangerous)",
  { skip: !LINUX || !DANGEROUS_MUTATIONS || "Bun" in globalThis || !isLinuxLibsecretAvailable() },
  (t) => {
    if (!LINUX || !DANGEROUS_MUTATIONS)
      return;

    const service = "neotales-js-linux-libsecret-test";
    const account = `acct-${Date.now()}`;
    const secret = "top-secret";

    try {
      saveSecret(service, account, secret);
      strictEqual(readSecret(service, account), secret);
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
