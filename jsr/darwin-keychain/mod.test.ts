import { isDarwinKeychainAvailable } from "./mod.ts";

Deno.test("keychain availability reports a boolean", () => {
  if (typeof isDarwinKeychainAvailable() !== "boolean") throw new Error("Unexpected availability");
});
