import { join, resolve } from "@std/path";

const root = resolve(import.meta.dirname!, "..");

interface Options {
  modules: string[];
  sshHost: string;
}

function usage(): never {
  throw new Error(
    "Usage: deno task test:remote --ssh <user@host> [module ...]",
  );
}

async function optionsFromArgs(): Promise<Options> {
  let sshHost: string | undefined;
  const modules: string[] = [];

  for (let index = 0; index < Deno.args.length; index++) {
    const argument = Deno.args[index];
    if (argument === "--ssh") {
      sshHost = Deno.args[++index] ?? usage();
    } else if (argument.startsWith("-")) {
      usage();
    } else if (/^[a-z0-9][a-z0-9-]*$/.test(argument)) {
      modules.push(argument);
    } else {
      usage();
    }
  }

  if (!sshHost) usage();
  return { modules: [...new Set(modules)], sshHost };
}

async function ensureModulesExist(modules: string[]): Promise<void> {
  for (const module of modules) {
    try {
      await Deno.stat(join(root, "jsr", module, "deno.json"));
      await Deno.stat(join(root, "npm", module, "package.json"));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Unknown imported module: ${module}`, { cause: error });
      }
      throw error;
    }
  }
}

async function run(command: string, args: string[], cwd = root, input?: string): Promise<void> {
  const child = new Deno.Command(command, {
    args,
    cwd,
    stdin: input === undefined ? "inherit" : "piped",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();

  if (input !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(input));
    await writer.close();
  }

  const status = await child.status;
  if (!status.success) {
    throw new Error(`${command} exited with code ${status.code}.`);
  }
}

function syncScript(): string {
  return String.raw`$ErrorActionPreference = "Stop"
$archive = Join-Path $HOME "os-remote-test.tar"
$target = Join-Path $HOME "work\os"

function ConvertTo-TarPath([string]$Path) {
  return "/" + $Path.Substring(0, 1).ToLowerInvariant() + "/" + $Path.Substring(3).Replace("\", "/")
}

if (Test-Path $target) {
  Remove-Item $target -Recurse -Force
}
New-Item -ItemType Directory -Force $target | Out-Null
tar -xf (ConvertTo-TarPath $archive) -C (ConvertTo-TarPath $target)
if ($LASTEXITCODE -ne 0) {
  throw "Failed to extract $archive"
}
Remove-Item $archive -Force
exit 0
`;
}

function testScript(modules: string[]): string {
  const moduleList = modules.map((module) => `"${module}"`).join(", ");

  return String.raw`$ErrorActionPreference = "Stop"
$target = Join-Path $HOME "work\os"
$modules = @(${moduleList})

Set-Location $target
git init
if ($LASTEXITCODE -ne 0) {
  throw "git init failed"
}
git config core.autocrlf false
if ($LASTEXITCODE -ne 0) {
  throw "git line-ending configuration failed"
}
git add --all
if ($LASTEXITCODE -ne 0) {
  throw "git add failed"
}
git -c user.name="Remote Test" -c user.email="remote-test@example.invalid" commit -m "Remote test baseline"
if ($LASTEXITCODE -ne 0) {
  throw "git baseline commit failed"
}
git config status.showUntrackedFiles no
if ($LASTEXITCODE -ne 0) {
  throw "git status configuration failed"
}
& mise exec -- pnpm install
if ($LASTEXITCODE -ne 0) {
  throw "pnpm install failed"
}

if ($modules.Count -eq 0) {
  & mise exec -- deno task test
  if ($LASTEXITCODE -ne 0) {
    throw "Remote test failed"
  }
} else {
  foreach ($module in $modules) {
    & mise exec -- deno task test $module
    if ($LASTEXITCODE -ne 0) {
      throw "Remote test failed for $module"
    }
  }
}
exit 0
`;
}

function remoteBootstrap(script: string): string {
  const encoded = btoa(script);

  return String.raw`$path = Join-Path $HOME ("os-remote-test-" + [guid]::NewGuid() + ".ps1")
[IO.File]::WriteAllBytes($path, [Convert]::FromBase64String("${encoded}"))
& powershell -NoProfile -ExecutionPolicy Bypass -File $path
$exitCode = $LASTEXITCODE
Remove-Item $path -Force -ErrorAction SilentlyContinue
exit $exitCode
`;
}

async function createArchive(): Promise<string> {
  const archive = await Deno.makeTempFile({ prefix: "neotales-os-remote-test-", suffix: ".tar" });
  await run("tar", [
    "--exclude-vcs",
    "--exclude=node_modules",
    "--exclude=artifacts",
    "--exclude=*.tgz",
    "-cf",
    archive,
    ".",
  ]);
  return archive;
}

const options = await optionsFromArgs();
await ensureModulesExist(options.modules);

const archive = await createArchive();
try {
  await run("scp", [archive, `${options.sshHost}:os-remote-test.tar`]);
  await run(
    "ssh",
    ["-T", options.sshHost, "powershell", "-NoProfile", "-Command", "-"],
    root,
    remoteBootstrap(syncScript()),
  );
  await run(
    "ssh",
    ["-T", options.sshHost, "powershell", "-NoProfile", "-Command", "-"],
    root,
    remoteBootstrap(testScript(options.modules)),
  );
} finally {
  await Deno.remove(archive).catch(() => undefined);
}
