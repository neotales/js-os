import { isLinuxLibsecretAvailable } from "./mod.ts";

Deno.test("libsecret availability reports a boolean", () => {
  if (typeof isLinuxLibsecretAvailable() !== "boolean") {
    throw new Error("Unexpected availability");
  }
});
