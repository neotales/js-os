import {
  getSecret,
  getSecretString,
  isAvailable,
  listSecrets,
  removeSecret,
  saveSecret,
} from "./mod.ts";
import { isWinCredAvailable, WinCred } from "./ffi.ts";

Deno.test("Credential Manager availability reports a boolean", () => {
  if (typeof isAvailable() !== "boolean")
    throw new Error("Unexpected availability");
});

Deno.test("native FFI entry point reports availability and defers unsupported errors", () => {
  if (typeof isWinCredAvailable() !== "boolean")
    throw new Error("Unexpected native availability");
  if (!isWinCredAvailable()) {
    try {
      WinCred.enumerate(null, 0);
      throw new Error("Expected unavailable native backend to throw");
    } catch (error) {
      if (!(error instanceof Error))
        throw error;
    }
  }
});

Deno.test("Deno without --allow-ffi reports Credential Manager as unavailable", async () => {
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
    if (!output.success)
      throw new Error(
        "Credential Manager unexpectedly required FFI permission during module loading.",
      );
  } finally {
    await Deno.remove(program);
  }
});

Deno.test("secret store operations roundtrip strings and bytes", {
  ignore: Deno.build.os !== "windows" ||
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
    if (getSecretString(service, stringAccount) !== "secret")
      throw new Error("String secret did not roundtrip.");
    const saved = getSecret(service, byteAccount);
    if (!saved || saved.join(",") !== bytes.join(","))
      throw new Error("Byte secret did not roundtrip.");
    if (listSecrets(service).length !== 2)
      throw new Error("Service secrets were not listed.");
  } finally {
    removeSecret(service, stringAccount);
    removeSecret(service, byteAccount);
  }
});
