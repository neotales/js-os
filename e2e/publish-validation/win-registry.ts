/**
 * Validates published win-registry packages on Windows.
 *
 * Run locally on Windows:
 *   deno run -A e2e/publish-validation/win-registry.ts
 *
 * Run on a remote Windows machine:
 *   deno run -A e2e/publish-validation/win-registry.ts --ssh user@host
 *
 * Pass --version <version> to test a version other than the one declared in
 * jsr/win-registry/deno.json.
 */

interface Options {
  sshHost?: string;
  version: string;
}

function usage(): never {
  throw new Error(
    "Usage: deno run -A e2e/publish-validation/win-registry.ts [--version <version>] [--ssh <user@host>]",
  );
}

async function optionsFromArgs(): Promise<Options> {
  let sshHost: string | undefined;
  let version: string | undefined;

  for (let index = 0; index < Deno.args.length; index++) {
    const argument = Deno.args[index];

    if (argument === "--ssh") {
      sshHost = Deno.args[++index] ?? usage();
    } else if (argument === "--version") {
      version = Deno.args[++index] ?? usage();
    } else {
      usage();
    }
  }

  if (!version) {
    const manifest = JSON.parse(
      await Deno.readTextFile(new URL("../../jsr/win-registry/deno.json", import.meta.url)),
    ) as { version?: unknown };
    if (typeof manifest.version !== "string") {
      throw new Error("jsr/win-registry/deno.json does not declare a package version.");
    }
    version = manifest.version;
  }

  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }

  return { sshHost, version };
}

function windowsValidationScript(version: string): string {
  const npmProbe = String
    .raw`import { isRegistryAvailable, Registry } from "@neotales/win-registry";

if (!isRegistryAvailable()) {
  throw new Error("Windows Registry backend is unavailable");
}

const path = "HKCU\\Software\\neotales-publish-validation";
const key = Registry.createKey(path);

try {
  key.setString("Text", "published-package");
  key.setInt32("Dword", 0x11223344);
  key.setInt64("Qword", 0x1122334455667788n);
  key.setMultiString("Multi", ["one", "two"]);

  if (key.getString("Text") !== "published-package") {
    throw new Error("String roundtrip failed");
  }
  if (key.getInt32("Dword") !== 0x11223344) {
    throw new Error("DWORD roundtrip failed");
  }
  if (key.getInt64("Qword") !== 0x1122334455667788n) {
    throw new Error("QWORD roundtrip failed");
  }
  if (key.getMultiString("Multi").join(",") !== "one,two") {
    throw new Error("Multi-string roundtrip failed");
  }

  console.log("registry roundtrip passed");
} finally {
  key.close();
  Registry.deleteKey(path);
}
`;
  const denoProbe =
    `import { isRegistryAvailable, Registry } from "jsr:@neotales/win-registry@${version}";

${npmProbe.slice(npmProbe.indexOf("if (!isRegistryAvailable())"))}`;
  const npmProbeBase64 = btoa(npmProbe);
  const denoProbeBase64 = btoa(denoProbe);

  return String.raw`$ErrorActionPreference = "Stop"
$version = ${JSON.stringify(version)}
$package = "@neotales/win-registry@$version"
$root = Join-Path ([IO.Path]::GetTempPath()) ("neotales-win-registry-" + [guid]::NewGuid())
Write-Output "Validating $package in $root"

function Invoke-Mise {
  param([string[]]$CommandArgs)
  & mise @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "mise command failed: mise $($CommandArgs -join ' ')"
  }
}

$npmProbe = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${npmProbeBase64}"))
$denoProbe = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${denoProbeBase64}"))
Write-Output "Running runtime matrix"

Write-Output "Running npm Node 24 koffi validation"
$npm = Join-Path $root "npm"
New-Item -ItemType Directory -Force $npm | Out-Null
[IO.File]::WriteAllText((Join-Path $npm "probe.mjs"), $npmProbe)
Set-Location $npm
Invoke-Mise -CommandArgs @("exec", "node@24", "--", "npm", "init", "-y")
Invoke-Mise -CommandArgs @("exec", "node@24", "--", "npm", "install", "--no-audit", "--no-fund", $package)
Invoke-Mise -CommandArgs @("exec", "node@24", "--", "node", "probe.mjs")
Write-Output "Running npm Node 26 native FFI validation"
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "node", "--experimental-ffi", "probe.mjs")

Write-Output "Running JSR Node 26 native FFI validation"
$nodeJsr = Join-Path $root "node-jsr"
New-Item -ItemType Directory -Force $nodeJsr | Out-Null
[IO.File]::WriteAllText((Join-Path $nodeJsr "probe.mjs"), $npmProbe)
Set-Location $nodeJsr
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "npm", "init", "-y")
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "npm", "install", "--save-dev", "--no-audit", "--no-fund", "jsr")
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "npx", "jsr", "add", "@neotales/win-registry@$version")
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "node", "--experimental-ffi", "probe.mjs")

Write-Output "Running npm Bun validation"
$bun = Join-Path $root "bun"
New-Item -ItemType Directory -Force $bun | Out-Null
[IO.File]::WriteAllText((Join-Path $bun "probe.mjs"), $npmProbe)
Set-Location $bun
Invoke-Mise -CommandArgs @("exec", "--", "bun", "init", "-y")
Invoke-Mise -CommandArgs @("exec", "--", "bun", "add", $package)
Invoke-Mise -CommandArgs @("exec", "--", "bun", "probe.mjs")

Write-Output "Running JSR Bun validation"
$bunJsr = Join-Path $root "bun-jsr"
New-Item -ItemType Directory -Force $bunJsr | Out-Null
[IO.File]::WriteAllText((Join-Path $bunJsr "probe.mjs"), $npmProbe)
Set-Location $bunJsr
Invoke-Mise -CommandArgs @("exec", "--", "bun", "init", "-y")
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "npm", "install", "--save-dev", "--no-audit", "--no-fund", "jsr")
Invoke-Mise -CommandArgs @("exec", "node@26", "--", "npx", "jsr", "add", "@neotales/win-registry@$version")
Invoke-Mise -CommandArgs @("exec", "--", "bun", "install")
Invoke-Mise -CommandArgs @("exec", "--", "bun", "probe.mjs")

Write-Output "Running JSR Deno validation"
$jsr = Join-Path $root "jsr"
New-Item -ItemType Directory -Force $jsr | Out-Null
[IO.File]::WriteAllText((Join-Path $jsr "probe.ts"), $denoProbe)
Set-Location $jsr
Invoke-Mise -CommandArgs @("exec", "--", "deno", "run", "--allow-ffi", "--minimum-dependency-age", "0", "probe.ts")
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
exit 0
`;
}

async function run(command: string, args: string[], script: string): Promise<void> {
  const child = new Deno.Command(command, {
    args,
    stdin: "piped",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(script));
  await writer.close();

  const status = await child.status;
  if (!status.success) {
    throw new Error(`${command} exited with code ${status.code}.`);
  }
}

const options = await optionsFromArgs();
const script = windowsValidationScript(options.version);

if (options.sshHost) {
  await run("ssh", ["-T", options.sshHost, "powershell", "-NoProfile", "-Command", "-"], script);
} else {
  if (Deno.build.os !== "windows") {
    throw new Error(
      "This runner requires Windows locally. Pass --ssh <user@host> to target Windows remotely.",
    );
  }
  await run("powershell", ["-NoProfile", "-Command", "-"], script);
}
