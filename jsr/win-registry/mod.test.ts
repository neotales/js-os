import { Registry, RegistryError, isRegistryAvailable } from "./mod.ts";
import { stringToWide, wideToString } from "./types.ts";

Deno.test("registry availability matches the platform", () => {
  if (isRegistryAvailable() !== (Deno.build.os === "windows")) {
    throw new Error("Unexpected registry availability");
  }
});

Deno.test("registry string conversion roundtrips", () => {
  if (wideToString(stringToWide("registry")) !== "registry") {
    throw new Error("Unexpected string conversion");
  }
});

Deno.test(
  "registry is unavailable outside Windows",
  { ignore: Deno.build.os === "windows" },
  () => {
    try {
      Registry.openKey("HKCU\\Software");
    } catch (error) {
      if (error instanceof RegistryError) return;
      throw error;
    }
    throw new Error("Expected RegistryError");
  },
);

Deno.test("registry reads Windows version values", { ignore: Deno.build.os !== "windows" }, () => {
  using key = Registry.openKey("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion");
  if (!key.getString("ProductName")) throw new Error("Expected Windows product name");
});
