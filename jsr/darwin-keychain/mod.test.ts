import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "./mod.ts";
import { DarwinKeychain, isDarwinKeychainAvailable, Security } from "./ffi.ts";

test("keychain availability reports a boolean", () => {
  assert.equal(typeof isAvailable(), "boolean");
});

test("native FFI entry point reports availability and defers unsupported errors", () => {
  assert.equal(typeof isDarwinKeychainAvailable(), "boolean");
  if (!isDarwinKeychainAvailable())
    assert.throws(() => DarwinKeychain.getSecretBytes("service", "account"));
});

test("Security API defers unsupported errors", () => {
  if (!isDarwinKeychainAvailable())
    assert.throws(() => Security.SecKeychainFindGenericPassword("service", "account"));
});

test("unsupported platforms return safe defaults", { skip: Deno.build.os === "darwin" }, () => {
  assert.equal(isAvailable(), false);
  assert.equal(getSecret("service", "account"), null);
  assert.equal(getSecretString("service", "account"), null);
  assert.deepEqual(listSecrets("service"), []);
  assert.equal(removeSecret("service", "account"), false);
  saveSecret("service", "account", "secret");
});

test("Deno without --allow-ffi reports Keychain as unavailable", async () => {
  if (Deno.build.os !== "darwin")
    return;

  const module = new URL("./mod.ts", import.meta.url).href;
  const program = await Deno.makeTempFile({ suffix: ".ts" });
  try {
    await Deno.writeTextFile(
      program,
      `import { isAvailable } from ${JSON.stringify(module)}; if (isAvailable()) Deno.exit(1);`,
    );
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-read", program],
    }).output();
    assert.equal(
      output.success,
      true,
      "Keychain unexpectedly required FFI permission during module loading.",
    );
  } finally {
    await Deno.remove(program);
  }
});

test("secret store operations roundtrip strings and bytes", {
  skip: Deno.build.os !== "darwin" ||
    !isAvailable() ||
    Deno.env.get("TEST_DANGEROUS_OS_MUTATIONS") !== "true" ||
    Deno.env.get("SSH_CONNECTION") !== undefined,
}, () => {
  const service = `neotales-test-${crypto.randomUUID()}`;
  const stringAccount = "string";
  const byteAccount = "bytes";
  const bytes = new Uint8Array([0, 255, 1]);

  try {
    saveSecret(service, stringAccount, "secret");
    saveSecret(service, byteAccount, bytes);
    assert.equal(getSecretString(service, stringAccount), "secret");
    assert.deepEqual(getSecret(service, byteAccount), bytes);
    assert.equal(listSecrets(service).length, 2);
  } finally {
    removeSecret(service, stringAccount);
    removeSecret(service, byteAccount);
  }
});
