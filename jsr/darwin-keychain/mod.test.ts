import { isDarwinKeychainAvailable } from "./mod.ts";

Deno.test("keychain availability matches the platform", () => {
  if (isDarwinKeychainAvailable() !== (Deno.build.os === "darwin"))
    throw new Error("Unexpected availability");
});
