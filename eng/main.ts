import { copy } from "@std/fs";
import { basename, join, resolve } from "@std/path";

const root = resolve(import.meta.dirname!, "..");
const upstream = resolve(
  (Deno.env.get("OS_MODULES") ?? "~/foss/js/os").replace(/^~(?=\/)/, Deno.env.get("HOME") ?? ""),
);
const jsrDir = join(root, "jsr");
const npmDir = join(root, "npm");
const oxfmt = join(root, "node_modules", ".bin", "oxfmt");
const oxlint = join(root, "node_modules", ".bin", "oxlint");

type PackageJson = {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  license?: string;
  exports?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type DenoConfig = {
  name: string;
  version: string;
};

type ReleasePackage = {
  module: string;
  npmName: string;
  jsrName: string;
  version: string;
  tarball: string;
};

function usage(): never {
  console.error(`Usage: deno task <task> [module] [--deno] [--node] [--bun] [--replace]

Tasks:
  import <module> [--replace]  Import one split JSR/npm package
  modules                     List available packages and import state
  build <module>              Compile one npm package with TypeScript
  test [module] [runtime]     Run JSR Deno and npm runtime tests
  lint                        Check source with oxlint
  fmt [--check]               Format or check formatting with oxfmt
  audit                       Audit npm dependencies
  check                       Run lint, formatting, audit, and all tests
  pack <module>               Create an npm tarball
  release-prepare <tag>       Create release artifacts for version-changed packages
  publish-bootstrap <module> [--dry-run]  First token-based npm publication`);
  Deno.exit(1);
}

function moduleName(args: string[], required = false): string | undefined {
  const names = args.filter((arg) => !arg.startsWith("-"));
  if (names.length > 1 || (required && names.length !== 1)) usage();
  if (names[0] && !/^[a-z0-9][a-z0-9-]*$/.test(names[0])) usage();
  return names[0];
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

async function run(command: string, args: string[], cwd = root): Promise<void> {
  const output = await new Deno.Command(command, {
    args,
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!output.success) Deno.exit(output.code);
}

async function capture(command: string, args: string[], cwd = root): Promise<Deno.CommandOutput> {
  return await new Deno.Command(command, { args, cwd, stdout: "piped", stderr: "piped" }).output();
}

function outputText(output: Deno.CommandOutput): string {
  return `${new TextDecoder().decode(output.stdout)}${new TextDecoder().decode(output.stderr)}`;
}

async function git(args: string[]): Promise<string> {
  const output = await capture("git", args);
  if (!output.success) throw new Error(outputText(output).trim());
  return new TextDecoder().decode(output.stdout).trim();
}

function releaseTag(args: string[]): string {
  const tags = args.filter((arg) => !arg.startsWith("-"));
  if (tags.length !== 1) usage();
  const tag = tags[0];
  if (!/^v\d{4}\.\d{2}\.\d{2}-(?:r[1-9]\d*|nightly\.r[1-9]\d*|beta\.r[1-9]\d*)$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
  return tag;
}

async function readPackage(directory: string): Promise<PackageJson> {
  return JSON.parse(await Deno.readTextFile(join(directory, "package.json"))) as PackageJson;
}

function rebrand(content: string): string {
  return content
    .replaceAll("@neostd/", "@neotales/")
    .replaceAll("github.com/neostd/js", "github.com/neotales/js-os")
    .replaceAll(
      "raw.githubusercontent.com/neostd/js/refs/heads/dev/eng/assets/logo.png",
      "raw.githubusercontent.com/neotales/js-std/refs/heads/dev/eng/assets/logo.png",
    )
    .replaceAll("raw.githubusercontent.com/neostd/js", "raw.githubusercontent.com/neotales/js-os");
}

async function rewriteTree(
  directory: string,
  extensions: RegExp,
  rewrite: (content: string) => string,
) {
  for await (const entry of Deno.readDir(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory) {
      await rewriteTree(path, extensions, rewrite);
    } else if (entry.isFile && extensions.test(entry.name)) {
      await Deno.writeTextFile(path, rewrite(await Deno.readTextFile(path)));
    }
  }
}

function npmExports(pkg: PackageJson): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(pkg.exports ?? {})) {
    if (name === "./package.json") continue;
    const output = basename(path).replace(/\.mjs$/, ".js");
    const declaration = output.replace(/\.js$/, ".d.ts");
    exports[name] = { types: `./types/${declaration}`, import: `./esm/${output}` };
  }
  return exports;
}

function npmManifest(pkg: PackageJson): Record<string, unknown> {
  const koffi = pkg.peerDependencies?.koffi;
  return {
    name: pkg.name.replace("@neostd/", "@neotales/"),
    version: pkg.version,
    description: pkg.description,
    keywords: pkg.keywords?.filter((keyword) => keyword !== "neostd"),
    license: pkg.license ?? "MIT",
    type: "module",
    files: ["esm", "types"],
    exports: npmExports(pkg),
    publishConfig: { access: "public" },
    repository: {
      type: "git",
      url: "git+https://github.com/neotales/js-os.git",
      directory: `npm/${pkg.name.replace("@neostd/", "")}`,
    },
    bugs: { url: "https://github.com/neotales/js-os/issues" },
    homepage: "https://github.com/neotales/js-os",
    engines: { node: ">=22" },
    scripts: {
      build: "tsc -p tsconfig.json",
      "build:test": "tsc -p tsconfig.test.json",
      test: "pnpm run build:test && node --test .test/tests/*.test.js",
      "test:ffi": "pnpm run build:test && node --experimental-ffi --test .test/tests/*.test.js",
      "test:bun": "pnpm run build:test && bun test ./.test/tests",
      "test:deno": "pnpm run build:test && deno test -A .test/tests",
    },
    devDependencies: {
      "@types/bun": "^1.3.14",
      "@types/node": "^25.9.3",
      typescript: "^6.0.3",
    },
    ...(koffi ? { optionalDependencies: { koffi } } : {}),
  };
}

function npmIgnore(): string {
  return (
    ["src/", "tests/", ".test/", "node_modules/", "*.tgz", "*.ts", "tsconfig*.json"].join("\n") +
    "\n"
  );
}

function npmTsConfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      rootDir: "src",
      outDir: "esm",
      declaration: true,
      declarationDir: "types",
      strict: true,
      skipLibCheck: true,
      types: ["node", "bun"],
    },
    include: ["src/**/*.ts"],
  };
}

function npmTestTsConfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      rootDir: ".",
      outDir: ".test",
      declaration: false,
      strict: true,
      skipLibCheck: true,
      types: ["node", "bun"],
    },
    include: ["src/**/*.ts", "tests/**/*.ts"],
  };
}

function isElevatedNpmIndex(): string {
  return `import process from "node:process";

type ElevationEvaluator = (cache?: boolean) => boolean;

let elevated: boolean | undefined;

function evalUnixElevation(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  const uid = process.geteuid?.() ?? process.getuid?.();
  elevated = uid === 0;
  return elevated;
}

let impl: ElevationEvaluator = evalUnixElevation;
const runtime = globalThis as { Bun?: unknown; Deno?: unknown };

if (process.platform === "win32") {
  const { createRequire } = process.getBuiltinModule("node:module") as typeof import("node:module");
  const require = createRequire(import.meta.url);

  if (runtime.Deno) {
    impl = (require("./ffi_deno.js") as typeof import("./ffi_deno.js")).evalIsProcessElevated;
  } else if (runtime.Bun) {
    impl = (require("./ffi_bun.js") as typeof import("./ffi_bun.js")).evalIsProcessElevated;
  } else {
    try {
      if (process.getBuiltinModule("node:ffi")) {
        impl = (require("./ffi_node.js") as typeof import("./ffi_node.js")).evalIsProcessElevated;
      } else {
        impl = (require("./ffi_koffi.js") as typeof import("./ffi_koffi.js")).evalIsProcessElevated;
      }
    } catch (error) {
      try {
        impl = (require("./ffi_koffi.js") as typeof import("./ffi_koffi.js")).evalIsProcessElevated;
      } catch {
        if (process.env.DEBUG === "true") console.debug(error);
      }
    }
  }
}

/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * import { isElevated } from "@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
`;
}

function isElevatedNpmNode(): string {
  return `import process from "node:process";

let elevated: boolean | undefined;

/**
 * Reports whether the current process has an effective user ID of zero.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has an effective user ID of zero.
 * @example
 * import { evalIsProcessElevated } from "./node.js";
 *
 * const elevated = evalIsProcessElevated();
 */
export function evalIsProcessElevated(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  const uid = process.geteuid?.() ?? process.getuid?.();
  elevated = uid === 0;
  return elevated;
}

`;
}

function ffiJSDoc(importPath: string): string {
  return `/**
 * Reports whether the current process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * \`\`\`ts
 * import { evalIsProcessElevated } from "${importPath}";
 *
 * const elevated = evalIsProcessElevated();
 * \`\`\`
 */`;
}

function documentFfi(source: string, importPath: string): string {
  return source.replace(
    "export function evalIsProcessElevated(cache = true): boolean {",
    `${ffiJSDoc(importPath)}\nexport function evalIsProcessElevated(cache = true): boolean {`,
  );
}

function isElevatedDenoFfi(denoExpression: string, importPath: string): string {
  return `/**
 * Implements native Windows elevation detection for Deno.
 *
 * @module @neotales/is-elevated/ffi_deno
 */

let elevated: boolean | undefined;
const deno = ${denoExpression};

${ffiJSDoc(importPath)}
export function evalIsProcessElevated(cache = true): boolean {
  if (!cache || elevated === undefined) {
    elevated = deno.uid() === 0;
  }

  if (deno.build.os !== "windows") {
    return elevated;
  }

  const advapi32 = deno.dlopen("Advapi32.dll", {
    OpenProcessToken: { parameters: ["pointer", "u32", "pointer"], result: "bool" },
    GetTokenInformation: {
      parameters: ["u64", "u32", "pointer", "u32", "pointer"],
      result: "bool",
    },
  });
  const kernel32 = deno.dlopen("Kernel32.dll", {
    GetCurrentProcess: { parameters: [], result: "pointer" },
    CloseHandle: { parameters: ["pointer"], result: "bool" },
    GetLastError: { parameters: [], result: "i32" },
  });

  try {
    const TOKEN_QUERY = 0x0008;
    const TOKEN_ELEVATION = 20;
    const processHandle = kernel32.symbols.GetCurrentProcess();
    const tokenHandle = new BigUint64Array(1);
    const tokenHandlePtr = deno.UnsafePointer.of(tokenHandle);
    const success = advapi32.symbols.OpenProcessToken(processHandle, TOKEN_QUERY, tokenHandlePtr);
    if (!success) {
      throw new Error("Failed to open process token");
    }

    try {
      const tokenInfo = new Uint8Array(4);
      const returnLength = new Uint32Array(1);
      const result = advapi32.symbols.GetTokenInformation(
        tokenHandle[0],
        TOKEN_ELEVATION,
        deno.UnsafePointer.of(tokenInfo),
        4,
        deno.UnsafePointer.of(returnLength),
      );
      if (!result) {
        throw new Error("Failed to get token information " + kernel32.symbols.GetLastError());
      }
      elevated = tokenInfo[0] !== 0;
      return elevated;
    } finally {
      kernel32.symbols.CloseHandle(tokenHandlePtr);
    }
  } finally {
    advapi32.close();
    kernel32.close();
  }
}
`;
}

async function writeDenoPackage(name: string, source: string, pkg: PackageJson): Promise<void> {
  const destination = join(jsrDir, name);
  await Deno.mkdir(destination, { recursive: true });
  await Deno.writeTextFile(
    join(destination, "ffi_deno.ts"),
    isElevatedDenoFfi("Deno", "./ffi_deno.ts"),
  );
  await Deno.copyFile(join(source, "LICENSE.md"), join(destination, "LICENSE.md"));
  const upstreamReadme = rebrand(await Deno.readTextFile(join(source, "README.md"))).replace(
    /## Runtime Notes[\s\S]*?(?=\n## License)/,
    "## Elevation Detection\n\nOn Unix-like systems, elevation means an effective user ID of `0`. The module uses an effective ID when the runtime exposes one and otherwise falls back to `Deno.uid()`. This keeps the result tied to the identity under which the process is actually executing.\n\nOn Windows, the module opens the current process token and calls `GetTokenInformation` with `TokenElevation`. The returned `TokenIsElevated` value describes the current process token, which is the relevant answer for an operation that needs administrator privileges.\n\nThis intentionally does not use `Shell32.IsUserAnAdmin`. That API is a convenience membership check and can disagree with the current token under User Account Control: an administrator account may be running with a filtered, non-elevated token. Token elevation inspection reports the process state directly.\n\n## Runtime Support\n\nThis JSR package supports Deno only. Use `npm:@neotales/is-elevated` when running under Node, Bun, or when a Deno project explicitly needs the cross-runtime npm package.\n",
  );
  await Deno.writeTextFile(join(destination, "README.md"), `${upstreamReadme}\n`);
  await Deno.writeTextFile(
    join(destination, "mod.ts"),
    `/**
 * Detects whether the current Deno process is running with elevated privileges.
 *
 * @module @neotales/is-elevated
 */

type ElevationEvaluator = (cache?: boolean) => boolean;

let elevated: boolean | undefined;
const deno = Deno as typeof Deno & { euid?: () => number };

function evalUnixElevation(cache = true): boolean {
  if (cache && elevated !== undefined) {
    return elevated;
  }
  elevated = (deno.euid?.() ?? Deno.uid()) === 0;
  return elevated;
}

let impl: ElevationEvaluator = evalUnixElevation;

if (Deno.build.os === "windows") {
  impl = (await import("./ffi_deno.ts")).evalIsProcessElevated;
}

/**
 * Reports whether the current Deno process is running with elevated privileges.
 *
 * @param cache - Whether to reuse the result from the first evaluation.
 * @returns Whether the process has elevated privileges.
 * @example
 * import { isElevated } from "jsr:@neotales/is-elevated";
 *
 * if (isElevated()) {
 *   console.log("The process is elevated.");
 * }
 */
export function isElevated(cache = true): boolean {
  return impl(cache);
}
`,
  );
  await Deno.writeTextFile(
    join(destination, "mod.test.ts"),
    `import { isElevated } from "./mod.ts";\n\nDeno.test("isElevated matches effective uid semantics on Unix-like systems", { ignore: Deno.build.os === "windows" }, () => {\n  const deno = Deno as typeof Deno & { euid?: () => number };\n  if (isElevated(false) !== ((deno.euid?.() ?? Deno.uid()) === 0)) {\n    throw new Error("Unexpected elevation result");\n  }\n});\n\nDeno.test("isElevated returns a boolean", () => {\n  if (typeof isElevated() !== "boolean") {\n    throw new Error("Expected a boolean");\n  }\n});\n`,
  );
  await Deno.writeTextFile(
    join(destination, "deno.json"),
    JSON.stringify(
      {
        name: pkg.name.replace("@neostd/", "@neotales/"),
        version: pkg.version,
        description: `${pkg.description} Deno only.`,
        license: pkg.license,
        exports: { ".": "./mod.ts" },
      },
      null,
      2,
    ) + "\n",
  );
}

async function writeNpmPackage(name: string, source: string, pkg: PackageJson): Promise<void> {
  const destination = join(npmDir, name);
  await copy(source, destination, { overwrite: false });
  for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "esm"]) {
    await Deno.remove(join(destination, file), { recursive: true }).catch((error: unknown) => {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    });
  }
  await rewriteTree(destination, /\.(?:ts|md)$/, (content) =>
    rebrand(content).replace(/(["'](?:\.{1,2}\/)[^"']+)\.ts(["'])/g, "$1.js$2"),
  );
  await Deno.writeTextFile(join(destination, "src", "index.ts"), isElevatedNpmIndex());
  await Deno.writeTextFile(join(destination, "src", "node.ts"), isElevatedNpmNode());
  for (const module of ["ffi_bun", "ffi_koffi"]) {
    const ffiPath = join(destination, "src", `${module}.ts`);
    await Deno.writeTextFile(
      ffiPath,
      documentFfi(await Deno.readTextFile(ffiPath), `./${module}.js`),
    );
  }
  const nodeFfiPath = join(destination, "src", "ffi_node.ts");
  const nodeFfi = await Deno.readTextFile(nodeFfiPath);
  await Deno.writeTextFile(
    nodeFfiPath,
    documentFfi(nodeFfi, "./ffi_node.js")
      .replaceAll("parameters:", "arguments:")
      .replaceAll("result:", "return:")
      .replaceAll("advapi32.close()", "advapi32.lib.close()")
      .replaceAll("kernel32.close()", "kernel32.lib.close()"),
  );
  await Deno.writeTextFile(
    join(destination, "src", "ffi_deno.ts"),
    isElevatedDenoFfi("(globalThis as typeof globalThis & { Deno?: any }).Deno", "./ffi_deno.js"),
  );
  const testPath = join(destination, "tests", "index.test.ts");
  const test = (await Deno.readTextFile(testPath))
    .replace(
      "node evaluator matches uid semantics",
      "node evaluator matches effective uid semantics",
    )
    .replace(
      'process.platform === "win32" || typeof process.getuid !== "function"',
      'process.platform === "win32" || (!process.geteuid && !process.getuid)',
    )
    .replace("process.getuid!() === 0", "(process.geteuid?.() ?? process.getuid?.()) === 0")
    .replace(
      'test(\n  "node evaluator falls back to false when uid is unavailable",',
      `test(
  "isElevated matches effective uid semantics on unix-like runtimes",
  { skip: process.platform === "win32" || (!process.geteuid && !process.getuid) },
  () => {
    strictEqual(isElevated(false), (process.geteuid?.() ?? process.getuid?.()) === 0);
  },
);

test(
  "node evaluator falls back to false when uid is unavailable",`,
    );
  await Deno.writeTextFile(testPath, test);
  await Deno.writeTextFile(
    join(destination, "package.json"),
    JSON.stringify(npmManifest(pkg), null, 2) + "\n",
  );
  await Deno.writeTextFile(join(destination, ".npmignore"), npmIgnore());
  await Deno.writeTextFile(
    join(destination, "tsconfig.json"),
    JSON.stringify(npmTsConfig(), null, 2) + "\n",
  );
  await Deno.writeTextFile(
    join(destination, "tsconfig.test.json"),
    JSON.stringify(npmTestTsConfig(), null, 2) + "\n",
  );
  await Deno.writeTextFile(
    join(destination, "README.md"),
    `${(await Deno.readTextFile(join(destination, "README.md"))).replace("## Runtime Notes", "## Elevation Detection\n\nOn Unix-like systems, elevation means an effective user ID of `0`. Node and Bun check `process.geteuid()` when available, then fall back to `process.getuid()`. The result is cached so repeated checks do not need to query the runtime again.\n\nOn Windows, the package opens the current process token and calls `GetTokenInformation` with `TokenElevation`. Node uses native `node:ffi` when available and otherwise the optional `koffi` dependency; Bun and Deno use their native FFI implementations. The FFI implementations are loaded only on Windows.\n\nThis intentionally does not use `Shell32.IsUserAnAdmin`. That API checks administrator-group membership rather than the current process token, so it can disagree under User Account Control when an administrator account is running with a filtered, non-elevated token. `TokenElevation` reports the process state directly.\n\n## Runtime Notes")}\n\n## Runtime Support\n\nThis npm package supports Node, Bun, and Deno. Deno users can import it with \`npm:@neotales/${name}\`; use the JSR package for the Deno-only implementation.\n`,
  );
}

async function upstreamModules(): Promise<string[]> {
  const modules: string[] = [];
  for await (const entry of Deno.readDir(upstream)) {
    if (entry.isDirectory && (await exists(join(upstream, entry.name, "package.json"))))
      modules.push(entry.name);
  }
  return modules.sort();
}

async function importedModules(): Promise<string[]> {
  const modules: string[] = [];
  for await (const entry of Deno.readDir(jsrDir)) {
    if (entry.isDirectory && (await exists(join(npmDir, entry.name, "package.json"))))
      modules.push(entry.name);
  }
  return modules.sort();
}

async function importModule(name: string, replace: boolean): Promise<void> {
  if (name !== "is-elevated") {
    throw new Error(
      `The Deno-only migration is defined for is-elevated only; review it before importing ${name}.`,
    );
  }
  const source = join(upstream, name);
  if (!(await exists(join(source, "package.json"))))
    throw new Error(`Unknown upstream package: ${name}`);
  const jsrPackage = join(jsrDir, name);
  const npmPackage = join(npmDir, name);
  if ((await exists(jsrPackage)) || (await exists(npmPackage))) {
    if (!replace)
      throw new Error(`Package already imported: ${name}. Use --replace to regenerate it.`);
    await Deno.remove(jsrPackage, { recursive: true });
    await Deno.remove(npmPackage, { recursive: true });
  }
  const pkg = await readPackage(source);
  await writeDenoPackage(name, source, pkg);
  await writeNpmPackage(name, source, pkg);
  await run(oxfmt, ["--write", jsrPackage, npmPackage]);
  console.log(`Imported split Deno and npm packages for ${name}.`);
}

async function buildModule(name: string): Promise<void> {
  const directory = join(npmDir, name);
  if (!(await exists(join(directory, "package.json"))))
    throw new Error(`Unknown imported package: ${name}`);
  await Deno.remove(join(directory, "esm"), { recursive: true }).catch(() => undefined);
  await Deno.remove(join(directory, "types"), { recursive: true }).catch(() => undefined);
  await run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], directory);
}

async function testModules(name: string | undefined, runtimes: Set<string>): Promise<void> {
  const modules = name ? [name] : await importedModules();
  if (!modules.length) {
    throw new Error("No packages have been imported.");
  }
  const selected = runtimes.size ? runtimes : new Set(["deno", "node", "bun"]);
  await run("pnpm", ["install"]);
  for (const module of modules) {
    if (selected.has("deno")) await run("deno", ["test", "-A"], join(jsrDir, module));
    await buildModule(module);
    const npmPackage = join(npmDir, module);
    if (selected.has("deno")) await run("pnpm", ["test:deno"], npmPackage);
    if (selected.has("node")) await run("pnpm", ["test"], npmPackage);
    if (selected.has("bun")) await run("pnpm", ["test:bun"], npmPackage);
  }
}

async function previousReleaseTag(currentTag: string): Promise<string | undefined> {
  const tags = (await git(["tag", "--merged", "HEAD", "--sort=-creatordate"]))
    .split("\n")
    .filter((tag) => tag && tag !== currentTag);
  return tags[0];
}

async function releasePackages(baseTag: string | undefined): Promise<ReleasePackage[]> {
  const packages: ReleasePackage[] = [];
  for (const module of await importedModules()) {
    const configPath = join(jsrDir, module, "deno.json");
    const current = JSON.parse(await Deno.readTextFile(configPath)) as DenoConfig;
    if (baseTag) {
      const previous = await capture("git", ["show", `${baseTag}:jsr/${module}/deno.json`]);
      if (previous.success) {
        const old = JSON.parse(new TextDecoder().decode(previous.stdout)) as DenoConfig;
        if (old.version === current.version) continue;
      }
    }
    packages.push({
      module,
      npmName: current.name,
      jsrName: current.name,
      version: current.version,
      tarball: "",
    });
  }
  return packages;
}

async function releasePrepare(tag: string): Promise<void> {
  const baseTag = await previousReleaseTag(tag);
  await run(oxlint, ["eng", "jsr", "npm"]);
  await format(true);
  await run("pnpm", ["audit", "--audit-level", "moderate"]);
  await testModules(undefined, new Set());

  const packages = await releasePackages(baseTag);
  if (!packages.length) {
    throw new Error(`No package versions changed since ${baseTag ?? "the initial release"}.`);
  }
  const artifacts = join(root, "artifacts", tag);
  await Deno.remove(artifacts, { recursive: true }).catch((error: unknown) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(artifacts, { recursive: true });
  for (const pkg of packages) {
    await buildModule(pkg.module);
    await run("pnpm", ["pack", "--pack-destination", artifacts], join(npmDir, pkg.module));
    const tarballs: string[] = [];
    for await (const entry of Deno.readDir(artifacts)) {
      if (entry.isFile && entry.name.endsWith(".tgz")) tarballs.push(entry.name);
    }
    const tarball = tarballs.find((entry) => entry.includes(pkg.module.replaceAll("-", "-")));
    if (!tarball) throw new Error(`Could not locate the tarball for ${pkg.module}.`);
    pkg.tarball = tarball;
  }

  const commits = (await git(["log", "--format=%s", ...(baseTag ? [`${baseTag}..HEAD`] : [])]))
    .split("\n")
    .filter((subject) =>
      /^(?:feat|fix|bug|perf|refactor|docs|chore)(?:\([^)]+\))?!?:/.test(subject),
    )
    .map((subject) => `- ${subject}`);
  await Deno.writeTextFile(
    join(artifacts, "CHANGELOG.md"),
    [
      `# ${tag}`,
      "",
      "## Packages",
      ...packages.map((pkg) => `- ${pkg.npmName}@${pkg.version}`),
      "",
      "## Changes",
      ...(commits.length ? commits : ["- No Conventional Commit messages found."]),
      "",
    ].join("\n"),
  );
  await Deno.writeTextFile(
    join(artifacts, "release.json"),
    JSON.stringify({ tag, baseTag: baseTag ?? null, packages }, null, 2) + "\n",
  );
}

async function publishNpm(args: string[], cwd: string, token?: string): Promise<void> {
  const authDir = await Deno.makeTempDir({ prefix: "neotales-npm-auth-" });
  const config = join(authDir, ".npmrc");
  await Deno.writeTextFile(config, "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n");
  try {
    const output = await new Deno.Command("pnpm", {
      args,
      cwd,
      env: { ...Deno.env.toObject(), NODE_AUTH_TOKEN: token ?? "", NPM_CONFIG_USERCONFIG: config },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!output.success) Deno.exit(output.code);
  } finally {
    await Deno.remove(authDir, { recursive: true });
  }
}

async function bootstrapPublish(name: string, dryRun: boolean): Promise<void> {
  let token = Deno.env.get("NODE_AUTH_TOKEN")?.trim();
  if (!dryRun && !token) {
    token = prompt("npm auth token:")?.trim();
    if (!token) throw new Error("An npm auth token is required for the initial npm publication.");
  }
  await run(oxlint, ["eng", "jsr", "npm"]);
  await format(true);
  await testModules(name, new Set());
  const directory = join(npmDir, name);
  const pkg = await readPackage(directory);
  const version = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`,
  );
  if (version.ok) throw new Error(`${pkg.name}@${pkg.version} already exists on npm.`);
  await run("pnpm", ["pack"], directory);
  const tarball = join(
    directory,
    `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`,
  );
  await publishNpm(
    [
      "publish",
      tarball,
      "--access",
      "public",
      "--registry",
      "https://registry.npmjs.org",
      ...(dryRun ? ["--dry-run", "--no-git-checks"] : []),
    ],
    directory,
    token,
  );
}

async function format(check: boolean): Promise<void> {
  await run(oxfmt, [
    check ? "--check" : "--write",
    "--ignore-path",
    ".prettierignore",
    "eng",
    "jsr",
    "npm",
    "README.md",
    "LICENSE.md",
    "deno.json",
    "package.json",
    "pnpm-workspace.yaml",
    ".oxlintrc.json",
    ".oxfmtrc.json",
  ]);
}

const [command, ...args] = Deno.args;
const name = ["import", "build", "pack", "publish-bootstrap"].includes(command)
  ? moduleName(args, true)
  : command === "test"
    ? moduleName(args)
    : undefined;
switch (command) {
  case "import":
    await importModule(name!, args.includes("--replace"));
    break;
  case "modules": {
    const imported = new Set(await importedModules());
    for (const module of await upstreamModules())
      console.log(`${imported.has(module) ? "imported" : "pending"} ${module}`);
    break;
  }
  case "build":
    await run("pnpm", ["install"]);
    await buildModule(name!);
    break;
  case "test": {
    const runtimes = new Set(
      args.filter((arg) => arg.startsWith("--") && arg !== "--replace").map((arg) => arg.slice(2)),
    );
    const invalid = [...runtimes].filter((runtime) => !["deno", "node", "bun"].includes(runtime));
    if (invalid.length) {
      throw new Error(`Unknown runtime: --${invalid.join(", --")}`);
    }
    await testModules(name, runtimes);
    break;
  }
  case "lint":
    await run(oxlint, ["eng", "jsr", "npm"]);
    break;
  case "fmt":
    await format(args.includes("--check"));
    break;
  case "audit":
    await run("pnpm", ["audit", "--audit-level", "moderate"]);
    break;
  case "check":
    await run(oxlint, ["eng", "jsr", "npm"]);
    await format(true);
    await run("pnpm", ["audit", "--audit-level", "moderate"]);
    await testModules(undefined, new Set());
    break;
  case "pack":
    await run("pnpm", ["install"]);
    await buildModule(name!);
    await run("pnpm", ["pack"], join(npmDir, name!));
    break;
  case "release-prepare":
    await releasePrepare(releaseTag(args));
    break;
  case "publish-bootstrap":
    await bootstrapPublish(name!, args.includes("--dry-run"));
    break;
  default:
    usage();
}
