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
import { isWinCredAvailable, WinCred } from "./ffi.ts";

test("Credential Manager availability reports a boolean", () => {
  assert.equal(typeof isAvailable(), "boolean");
});

test("native FFI entry point reports availability and defers unsupported errors", () => {
  assert.equal(typeof isWinCredAvailable(), "boolean");
  if (!isWinCredAvailable())
    assert.throws(() => WinCred.enumerate(null, 0));
});

test("Deno without --allow-ffi reports Credential Manager as unavailable", async () => {
  if (Deno.build.os !== "windows")
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
      "Credential Manager unexpectedly required FFI permission during module loading.",
    );
  } finally {
    await Deno.remove(program);
  }
});

test("secret store operations roundtrip strings and bytes", {
  skip: Deno.build.os !== "windows" ||
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
    const saved = getSecret(service, byteAccount);
    assert.deepEqual(saved, bytes);
    assert.equal(listSecrets(service).length, 2);
  } finally {
    removeSecret(service, stringAccount);
    removeSecret(service, byteAccount);
  }
});
