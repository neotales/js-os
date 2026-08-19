import { decodeSecret, encodeSecret, isAvailable, listCredentials } from "./mod.ts";

Deno.test("credential availability matches the platform", () => {
  if (isAvailable() !== (Deno.build.os === "windows")) throw new Error("Unexpected availability");
});

Deno.test("credential secret encoding roundtrips", () => {
  if (decodeSecret(encodeSecret("secret")) !== "secret") throw new Error("Unexpected secret");
});

Deno.test("credential listing is safe on Windows", { ignore: Deno.build.os !== "windows" }, () => {
  if (!Array.isArray(listCredentials())) throw new Error("Expected credentials");
});
