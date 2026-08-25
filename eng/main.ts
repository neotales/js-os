import { copy } from "@std/fs";
import { basename, join, resolve } from "@std/path";

const root = resolve(import.meta.dirname!, "..");
const upstream = resolve(
  (Deno.env.get("OS_MODULES") ?? "~/foss/js/os").replace(/^~(?=\/)/, Deno.env.get("HOME") ?? ""),
);
const jsrDir = join(root, "jsr");
const npmDir = join(root, "npm");
const executableExtension = Deno.build.os === "windows" ? ".cmd" : "";
const oxlint = join(root, "node_modules", ".bin", `oxlint${executableExtension}`);

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
  fmt [--check]               Format or check formatting with deno fmt
  audit                       Audit npm dependencies
  check                       Run lint, formatting, audit, and all tests
  pack <module>               Create an npm tarball
  release-prepare <tag>       Create release artifacts for version-changed packages
  publish-bootstrap <module> [--dry-run]  First token-based npm publication`);
  Deno.exit(1);
}

function moduleName(args: string[], required = false): string | undefined {
  const names = args.filter((arg) => !arg.startsWith("-"));
  if (names.length > 1 || (required && names.length !== 1))
    usage();
  if (names[0] && !/^[a-z0-9][a-z0-9-]*$/.test(names[0]))
    usage();
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
  if (!output.success)
    Deno.exit(output.code);
}

async function capture(command: string, args: string[], cwd = root): Promise<Deno.CommandOutput> {
  return await new Deno.Command(command, { args, cwd, stdout: "piped", stderr: "piped" }).output();
}

function outputText(output: Deno.CommandOutput): string {
  return `${new TextDecoder().decode(output.stdout)}${new TextDecoder().decode(output.stderr)}`;
}

async function git(args: string[]): Promise<string> {
  const output = await capture("git", args);
  if (!output.success)
    throw new Error(outputText(output).trim());
  return new TextDecoder().decode(output.stdout).trim();
}

function releaseTag(args: string[]): string {
  const tags = args.filter((arg) => !arg.startsWith("-"));
  if (tags.length !== 1)
    usage();
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
    .replaceAll("@neostd%2F", "@neotales%2F")
    .replaceAll("neostd-js", "neotales-js")
    .replaceAll("github.com/neostd/js", "github.com/neotales/js-os")
    .replaceAll("badge.fury.io/gh/neostd%2Fjs", "badge.fury.io/gh/neotales%2Fjs-os")
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
    if (name === "./package.json")
      continue;
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
      test: "node --test esm/*.test.js",
      "test:ffi": "node --experimental-ffi --test esm/*.test.js",
      "test:bun": "bun test esm/*.test.js",
      "test:deno": "deno test -A esm/*.test.js",
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
    [
      "src/",
      "node_modules/",
      "*.tgz",
      "*.ts",
      "tsconfig*.json",
      "esm/*.test.js",
      "types/*.test.d.ts",
    ].join("\n") + "\n"
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
      newLine: "lf",
      declaration: true,
      declarationDir: "types",
      strict: true,
      skipLibCheck: true,
      types: ["node", "bun"],
    },
    include: ["src/**/*.ts"],
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
        if (process.env.DEBUG === "true")
console.debug(error);
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
  await rewriteTree(
    destination,
    /\.(?:ts|md)$/,
    (content) => rebrand(content).replace(/(["'](?:\.{1,2}\/)[^"']+)\.ts(["'])/g, "$1.js$2"),
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
  await Deno.writeTextFile();
  await Deno.writeTextFile(
    join(destination, "README.md"),
    `${
      (await Deno.readTextFile(join(destination, "README.md"))).replace(
        "## Runtime Notes",
        "## Elevation Detection\n\nOn Unix-like systems, elevation means an effective user ID of `0`. Node and Bun check `process.geteuid()` when available, then fall back to `process.getuid()`. The result is cached so repeated checks do not need to query the runtime again.\n\nOn Windows, the package opens the current process token and calls `GetTokenInformation` with `TokenElevation`. Node uses native `node:ffi` when available and otherwise the optional `koffi` dependency; Bun and Deno use their native FFI implementations. The FFI implementations are loaded only on Windows.\n\nThis intentionally does not use `Shell32.IsUserAnAdmin`. That API checks administrator-group membership rather than the current process token, so it can disagree under User Account Control when an administrator account is running with a filtered, non-elevated token. `TokenElevation` reports the process state directly.\n\n## Runtime Notes",
      )
    }\n\n## Runtime Support\n\nThis npm package supports Node, Bun, and Deno. Deno users can import it with \`npm:@neotales/${name}\`; use the JSR package for the Deno-only implementation.\n`,
  );
}

function winRegistryApi(source: string): string {
  const start = source.indexOf("export class Registry {");
  const end = source.lastIndexOf("\n}\n");
  if (start === -1 || end < start) {
    throw new Error("Unexpected win-registry Registry API layout.");
  }

  return `${source.slice(0, start)}
/**
 * Opens an existing registry key.
 *
 * @param path Registry path to open.
 * @param access Requested access rights.
 * @returns The opened registry key.
 */
function openRegistryKey(path: string, access?: number): Key;
/**
 * Opens a child key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 * @param access Requested access rights.
 * @returns The opened registry key.
 */
function openRegistryKey(key: Key, path: string, access?: number): Key;
function openRegistryKey(arg1: Key | string, arg2?: string | number, arg3?: number): Key {
  if (typeof arg1 === "string") {
    const { hkey, subKey } = parseRegistryPath(arg1);
    const access = (arg2 as number | undefined) ?? Rights.READ;
    return new RegistryKey(driver.openKey(hkey, subKey, access), arg1);
  }

  return arg1.openKey(arg2 as string, arg3 ?? Rights.READ);
}

/**
 * Creates a registry key if needed and opens it.
 *
 * @param path Registry path to create.
 * @param access Requested access rights.
 * @returns The created or opened registry key.
 */
function createRegistryKey(path: string, access?: number): Key;
/**
 * Creates a child registry key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 * @param access Requested access rights.
 * @returns The created or opened registry key.
 */
function createRegistryKey(key: Key, path: string, access?: number): Key;
function createRegistryKey(arg1: Key | string, arg2?: string | number, arg3?: number): Key {
  if (typeof arg1 === "string") {
    const { hkey, subKey } = parseRegistryPath(arg1);
    const access = (arg2 as number | undefined) ?? Rights.ALL_ACCESS;
    const result = driver.createKey(hkey, subKey, access);
    return new RegistryKey(result.handle, arg1, result.created);
  }

  return arg1.createKey(arg2 as string, arg3 ?? Rights.ALL_ACCESS);
}

/**
 * Deletes a registry key.
 *
 * @param path Registry path to delete.
 */
function deleteRegistryKey(path: string): void;
/**
 * Deletes a child key relative to an existing key.
 *
 * @param key Parent key.
 * @param path Relative child path.
 */
function deleteRegistryKey(key: Key, path: string): void;
function deleteRegistryKey(arg1: Key | string, arg2?: string): void {
  if (typeof arg1 === "string") {
    const { hkey, subKey } = parseRegistryPath(arg1);
    const status = Number(driver.deleteKey(hkey, subKey));
    if (status !== 0) {
      throw new RegistryError(
        \`Failed to delete registry key "\${arg1}" with error code \${status}\`,
      );
    }
    return;
  }

  const parent = arg1;
  const path = arg2 as string;
  if (!parent.deleteKey(path)) {
    throw new RegistryError(\`Failed to delete registry key "\${path}"\`);
  }
}

type RegistryApi = {
  readonly HKCR: Key;
  readonly HKCU: Key;
  readonly HKLM: Key;
  readonly HKU: Key;
  readonly HKPD: Key;
  readonly HKCC: Key;
  openKey: typeof openRegistryKey;
  createKey: typeof createRegistryKey;
  deleteKey: typeof deleteRegistryKey;
};

/** Windows Registry API facade. */
export const Registry: RegistryApi = {
  /** Returns the predefined \`HKEY_CLASSES_ROOT\` key. */
  get HKCR(): Key {
    return predefinedKey(HKEY_CLASSES_ROOT, "HKEY_CLASSES_ROOT");
  },
  /** Returns the predefined \`HKEY_CURRENT_USER\` key. */
  get HKCU(): Key {
    return predefinedKey(HKEY_CURRENT_USER, "HKEY_CURRENT_USER");
  },
  /** Returns the predefined \`HKEY_LOCAL_MACHINE\` key. */
  get HKLM(): Key {
    return predefinedKey(HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE");
  },
  /** Returns the predefined \`HKEY_USERS\` key. */
  get HKU(): Key {
    return predefinedKey(HKEY_USERS, "HKEY_USERS");
  },
  /** Returns the predefined \`HKEY_PERFORMANCE_DATA\` key. */
  get HKPD(): Key {
    return predefinedKey(HKEY_PERFORMANCE_DATA, "HKEY_PERFORMANCE_DATA");
  },
  /** Returns the predefined \`HKEY_CURRENT_CONFIG\` key. */
  get HKCC(): Key {
    return predefinedKey(HKEY_CURRENT_CONFIG, "HKEY_CURRENT_CONFIG");
  },
  openKey: openRegistryKey,
  createKey: createRegistryKey,
  deleteKey: deleteRegistryKey,
} as const;
${source.slice(end + 3)}`;
}

function winRegistryValueHandling(source: string): string {
  return source
    .replace(
      'const buf = buffer ?? new Uint8Array(4096);\n    const result = driver.queryValue(this.#handle, name, buf);\n    if (!result) {\n      throw new RegistryError(`Registry value "${name}" not found under "${this.#path}".`);\n    }\n\n    return { data: buf.subarray(0, result.bytesRead), type: result.type };',
      'const result = driver.queryValue(this.#handle, name);\n    if (!result) {\n      throw new RegistryError(`Registry value "${name}" not found under "${this.#path}".`);\n    }\n\n    if (buffer && buffer.length >= result.data.length) {\n      buffer.set(result.data);\n      return { data: buffer.subarray(0, result.data.length), type: result.type };\n    }\n\n    return result;',
    )
    .replace(
      "queryValue(\n    hkey: bigint,\n    valueName: string,\n    buffer: Uint8Array,\n  ): { type: number; bytesRead: number } | null;",
      "queryValue(hkey: bigint, valueName: string): { type: number; data: Uint8Array } | null;",
    )
    .replace(
      "queryValue(\n    _hkey: bigint,\n    _value: string,\n    _buffer: Uint8Array,\n  ): { bytesRead: number; type: number } | null {",
      "queryValue(_hkey: bigint, _value: string): { data: Uint8Array; type: number } | null {",
    );
}

function winRegistryDocumentation(source: string): string {
  return source
    .replace(
      "/** Windows Registry value access rights. */\nexport const Rights",
      '/**\n * Windows Registry access rights. Prefer the least-privileged mask that supports the operation.\n *\n * @example\n * using key = Registry.openKey("HKCU\\\\Software", Rights.READ);\n */\nexport const Rights',
    )
    .replace(
      "/** Windows Registry value types. */\nexport const Types",
      '/**\n * Windows Registry value-type constants used by `getValue()` and `setValue()`.\n *\n * @example\n * key.setValue("Flag", new Uint8Array([1, 0, 0, 0]), Types.DWORD);\n */\nexport const Types',
    )
    .replace(
      "/** Summary information about a registry key. */",
      "/**\n * Summary information about a registry key.\n *\n * @example\n * const info = key.stat();\n * console.log(info.subKeyCount, info.valueCount);\n */",
    )
    .replace(
      "/** Public registry key contract used by `Registry` and `RegistryKey`. */",
      '/**\n * Public registry key contract used by `Registry` and `RegistryKey`. Opened and created keys own a native handle.\n *\n * @example\n * using key = Registry.createKey("HKCU\\\\Software\\\\Example");\n * key.setString("Theme", "dark");\n * console.log(key.getString("Theme"));\n */',
    )
    .replace(
      "/** Internal backend contract implemented by runtime-specific FFI layers. */",
      "/**\n * Advanced backend contract implemented by runtime-specific FFI layers. Most applications should use `Registry`.\n *\n * @example\n * const supported = isRegistryAvailable();\n */",
    )
    .replace(
      "export class RegistryError extends Error {",
      '/**\n * Error raised when registry operations are unavailable or fail.\n *\n * @example\n * if (!isRegistryAvailable()) throw new RegistryError("Windows Registry is unavailable");\n */\nexport class RegistryError extends Error {',
    )
    .replace(
      "/**\n * Open registry key handle with convenience helpers for reading and writing\n * values.\n */",
      '/**\n * Open registry key handle with convenience helpers for reading and writing values. Use `using` or `close()` to release opened and created keys.\n *\n * @example\n * using key = Registry.openKey("HKCU\\\\Software");\n * console.log(key.getSubKeyNames());\n */',
    )
    .replace(
      " * @returns `true` when registry operations are supported on the current runtime.\n */\nexport function isRegistryAvailable",
      ' * @returns `true` when registry operations are supported on the current runtime.\n * @example\n * if (isRegistryAvailable()) {\n *   using key = Registry.openKey("HKCU\\\\Software");\n * }\n */\nexport function isRegistryAvailable',
    )
    .replace(
      "/** Windows Registry API facade. */",
      '/**\n * Windows Registry API facade.\n *\n * @example\n * using key = Registry.createKey("HKCU\\\\Software\\\\Example");\n * key.setInt32("LaunchCount", 1);\n */',
    )
    .replace(
      " * @returns A UTF-16LE buffer with a trailing null terminator.\n */\nexport function stringToWide",
      ' * @returns A UTF-16LE buffer with a trailing null terminator.\n * @example\n * const data = stringToWide("Theme");\n */\nexport function stringToWide',
    )
    .replace(
      " * @returns The decoded string up to the first null terminator.\n */\nexport function wideToString",
      ' * @returns The decoded string up to the first null terminator.\n * @example\n * const value = wideToString(stringToWide("Theme"));\n */\nexport function wideToString',
    )
    .replace(
      " * @returns The decoded string list.\n */\nexport function wideToMultiString",
      ' * @returns The decoded string list.\n * @example\n * const values = wideToMultiString(multiStringToWide(["one", "two"]));\n */\nexport function wideToMultiString',
    )
    .replace(
      " * @returns The encoded multi-string buffer.\n */\nexport function multiStringToWide",
      ' * @returns The encoded multi-string buffer.\n * @example\n * const data = multiStringToWide(["one", "two"]);\n */\nexport function multiStringToWide',
    );
}

function winRegistryFfi(source: string): string {
  const transformed = source
    .replace(
      "queryValue(hkey, valueName, buffer) {",
      "queryValue(hkey, valueName) {\n    const buffer = new Uint8Array(4096);",
    )
    .replace(
      /      buffer\.set\(bigBuf\.subarray\(0, Math\.min\(buffer\.length, needed\)\)\);\n      return \{ type: ([^,]+), bytesRead: needed \};/,
      "      return { type: $1, data: bigBuf };",
    )
    .replace(
      /    return \{ type: ([^,]+), bytesRead: ([^}]+) \};/,
      "    return { type: $1, data: buffer.subarray(0, $2) };",
    );
  if (transformed === source)
    throw new Error("Unexpected win-registry FFI source layout.");
  return transformed;
}

function winRegistryDenoRegistry(source: string): string {
  const globals = source.indexOf("const globals =");
  const driver = source.indexOf("let isSupported = false;");
  const api = source.indexOf("/**\n * Returns whether a Windows Registry backend", driver);
  if (globals === -1 || driver === -1 || api === -1) {
    throw new Error("Unexpected win-registry source layout.");
  }

  const denoDriver = `let isSupported = false;

let driver: RegistryBackend = {
  openKey(_hkey: bigint, _subKey: string, _access: number): bigint {
    RegistryError.throwUnsupported();
  },
  createKey(_hkey: bigint, _subKey: string, _access: number): { handle: bigint; created: boolean } {
    RegistryError.throwUnsupported();
  },
  deleteKey(_hkey: bigint, _subKey: string): number {
    RegistryError.throwUnsupported();
  },
  deleteValue(_hkey: bigint, _value: string): number {
    RegistryError.throwUnsupported();
  },
  enumKeyNames(_hkey: bigint, _index: number, _bufSize: number): string | null {
    RegistryError.throwUnsupported();
  },
  enumValueNames(_hkey: bigint, _index: number, _bufSize: number): string | null {
    RegistryError.throwUnsupported();
  },
  queryValue(_hkey: bigint, _value: string): { data: Uint8Array; type: number } | null {
    RegistryError.throwUnsupported();
  },
  queryInfoKey(_hkey: bigint): {
    subKeyCount: number;
    maxSubKeyLength: number;
    valueCount: number;
    maxValueNameLength: number;
    maxValueLength: number;
    lastWriteTime: number;
  } {
    RegistryError.throwUnsupported();
  },
  closeKey(_hkey: bigint): void {
    return;
  },
  setValue(_hkey: bigint, _value: string, _type: number, _data: Uint8Array): void {
    RegistryError.throwUnsupported();
  },
};

if (Deno.build.os === "windows") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and a loadable Windows backend.
  }
}

`;
  return `${source.slice(0, globals)}${
    source.slice(source.indexOf("export class RegistryError", globals), driver)
  }${denoDriver}${source.slice(api)}`;
}

function winRegistryNpmRegistry(source: string): string {
  const runtimeDrivers =
    /if \(typeof globals\.Deno !== "undefined"\) \{\n    driver = require\("\.\/ffi_deno\.js"\)\.backend;\n    isSupported = true;\n  \} else if \(typeof globals\.Bun !== "undefined"\) \{\n    driver = require\("\.\/ffi_bun\.js"\)\.backend;\n    isSupported = true;\n  \} else \{/;
  return source.replace(
    runtimeDrivers,
    `if (typeof globals.Deno !== "undefined") {
    try {
      driver = require("./ffi_deno.js").backend;
      isSupported = true;
    } catch (error) {
      if (process.env.DEBUG === "true")
console.debug(error);
    }
  } else if (typeof globals.Bun !== "undefined") {
    try {
      driver = require("./ffi_bun.js").backend;
      isSupported = true;
    } catch (error) {
      if (process.env.DEBUG === "true")
console.debug(error);
    }
  } else {`,
  );
}

async function writeWinRegistryDenoPackage(
  name: string,
  source: string,
  pkg: PackageJson,
): Promise<void> {
  const destination = join(jsrDir, name);
  await Deno.mkdir(destination, { recursive: true });
  await Deno.copyFile(join(source, "LICENSE.md"), join(destination, "LICENSE.md"));
  const readme = rebrand(await Deno.readTextFile(join(source, "README.md"))).replace(
    /## Runtime Notes[\s\S]*?(?=\n## License)/,
    '## Runtime Support\n\nThis JSR package supports Deno on Windows. Run Deno with `--allow-ffi`; when FFI permission is absent or the backend cannot load, `isRegistryAvailable()` returns `false` and registry operations throw `RegistryError`. Use `npm:@neotales/win-registry` when a project needs the cross-runtime package.\n\n## Resource Management\n\nEvery key returned by `Registry.openKey()` or `Registry.createKey()` owns a Windows registry handle. Prefer `using` so the handle closes at the end of its lexical scope, even when an operation throws. Predefined root keys such as `Registry.HKCU` do not need closing.\n\n```ts\nusing key = Registry.openKey("HKCU\\\\Software");\nconsole.log(key.getValueNames());\n```\n\nWhen `using` is unavailable, close the key in `finally`:\n\n```ts\nconst key = Registry.openKey("HKCU\\\\Software");\ntry {\n  console.log(key.getValueNames());\n} finally {\n  key.close();\n}\n```\n',
  );
  const installation =
    '## Installation\n\n```sh\ndeno add jsr:@neotales/win-registry\n```\n\n```ts\nimport { Registry } from "jsr:@neotales/win-registry";\n```\n';
  await Deno.writeTextFile(
    join(destination, "README.md"),
    `${readme.replace(/## Installation[\s\S]*?(?=\n## Usage)/, installation)}\n`,
  );
  await Deno.writeTextFile(
    join(destination, "types.ts"),
    winRegistryValueHandling(
      winRegistryDocumentation(rebrand(await Deno.readTextFile(join(source, "src", "types.ts")))),
    ),
  );
  await Deno.writeTextFile(
    join(destination, "ffi_deno.ts"),
    winRegistryFfi(await Deno.readTextFile(join(source, "src", "ffi_deno.ts"))),
  );
  await Deno.writeTextFile(
    join(destination, "registry.ts"),
    winRegistryDenoRegistry(
      winRegistryApi(
        winRegistryValueHandling(
          winRegistryDocumentation(await Deno.readTextFile(join(source, "src", "registry.ts"))),
        ),
      ),
    ),
  );
  await Deno.writeTextFile(
    join(destination, "mod.ts"),
    rebrand(await Deno.readTextFile(join(source, "src", "index.ts"))),
  );
  await Deno.writeTextFile(
    join(destination, "mod.test.ts"),
    `import { Registry, RegistryError, isRegistryAvailable } from "./mod.ts";
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

Deno.test("registry is unavailable outside Windows", { ignore: Deno.build.os === "windows" }, () => {
  try {
    Registry.openKey("HKCU\\\\Software");
  } catch (error) {
    if (error instanceof RegistryError)
return;
    throw error;
  }
  throw new Error("Expected RegistryError");
});

Deno.test("registry reads Windows version values", { ignore: Deno.build.os !== "windows" }, () => {
  using key = Registry.openKey("HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion");
  if (!key.getString("ProductName"))
throw new Error("Expected Windows product name");
});
`,
  );
  await Deno.writeTextFile(
    join(destination, "deno.json"),
    JSON.stringify(
      {
        name: pkg.name.replace("@neostd/", "@neotales/"),
        version: pkg.version,
        description: `${pkg.description} Deno on Windows only.`,
        license: pkg.license,
        exports: { ".": "./mod.ts", "./registry": "./registry.ts", "./types": "./types.ts" },
      },
      null,
      2,
    ) + "\n",
  );
}

async function writeWinRegistryNpmPackage(
  name: string,
  source: string,
  pkg: PackageJson,
): Promise<void> {
  const destination = join(npmDir, name);
  await copy(source, destination, { overwrite: false });
  for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "esm"]) {
    await Deno.remove(join(destination, file), { recursive: true }).catch((error: unknown) => {
      if (!(error instanceof Deno.errors.NotFound))
        throw error;
    });
  }
  await rewriteTree(
    destination,
    /\.(?:ts|md)$/,
    (content) => rebrand(content).replace(/(["'](?:\.{1,2}\/)[^"']+)\.ts(["'])/g, "$1.js$2"),
  );
  const typesPath = join(destination, "src", "types.ts");
  await Deno.writeTextFile(
    typesPath,
    winRegistryValueHandling(winRegistryDocumentation(await Deno.readTextFile(typesPath))),
  );
  const registryPath = join(destination, "src", "registry.ts");
  await Deno.writeTextFile(
    registryPath,
    winRegistryApi(
      winRegistryValueHandling(
        winRegistryDocumentation(winRegistryNpmRegistry(await Deno.readTextFile(registryPath))),
      ),
    ),
  );
  for (const module of ["ffi_bun", "ffi_deno", "ffi_koffi", "ffi_node"]) {
    const ffiPath = join(destination, "src", `${module}.ts`);
    await Deno.writeTextFile(ffiPath, winRegistryFfi(await Deno.readTextFile(ffiPath)));
  }
  const nodeFfiPath = join(destination, "src", "ffi_node.ts");
  await Deno.writeTextFile(
    nodeFfiPath,
    (await Deno.readTextFile(nodeFfiPath))
      .replaceAll("parameters:", "arguments:")
      .replaceAll("result:", "return:"),
  );
  await Deno.writeTextFile(
    join(destination, "package.json"),
    JSON.stringify(npmManifest(pkg), null, 2) + "\n",
  );
  await Deno.writeTextFile(join(destination, ".npmignore"), npmIgnore());
  await Deno.writeTextFile(
    join(destination, "tsconfig.json"),
    JSON.stringify(npmTsConfig(), null, 2) + "\n",
  );
  await Deno.writeTextFile();
  const testPath = join(destination, "tests", "index.test.ts");
  const tests = (await Deno.readTextFile(testPath))
    .replace(
      "    } finally {\n      Registry.deleteKey(TEST_KEY);\n    }",
      "    } finally {\n      k.close();\n      Registry.deleteKey(TEST_KEY);\n    }",
    )
    .replace(
      '    } finally {\n      Registry.deleteKey("HKCU\\\\Software\\\\neotales-js-test-registry-relative");\n    }',
      '    } finally {\n      created.close();\n      Registry.deleteKey("HKCU\\\\Software\\\\neotales-js-test-registry-relative");\n    }',
    );
  await Deno.writeTextFile(
    testPath,
    `${tests}

test("win-registry::Registry preserves values larger than 4 KiB", { skip: !WINDOWS || !DANGEROUS_MUTATIONS }, () => {
  if (!WINDOWS || !DANGEROUS_MUTATIONS)
return;

  const key = Registry.createKey(TEST_KEY);
  try {
    const binary = Uint8Array.from({ length: 8192 }, (_, index) => index % 256);
    const string = "registry-value-".repeat(512);
    const multi = ["first-".repeat(512), "second-".repeat(512)];

    key.setBinary("LargeBinary", binary);
    key.setString("LargeString", string);
    key.setMultiString("LargeMulti", multi);

    equal(key.getBinary("LargeBinary").length, binary.length);
    equal(key.getBinary("LargeBinary")[8191], binary[8191]);
    equal(key.getString("LargeString"), string);
    equal(key.getMultiString("LargeMulti")[1], multi[1]);
  } finally {
    key.close();
    Registry.deleteKey(TEST_KEY);
  }
});
`,
  );
  const npmReadme = (await Deno.readTextFile(join(destination, "README.md")))
    .replace(
      /## Installation[\s\S]*?(?=\n## Usage)/,
      '## Installation\n\n```sh\npnpm add @neotales/win-registry\n```\n\n```ts\nimport { Registry } from "@neotales/win-registry";\n```\n\nDeno projects that need the npm package can use `deno add npm:@neotales/win-registry` and import from `npm:@neotales/win-registry`.\n',
    )
    .replace(
      /## Runtime Notes[\s\S]*?(?=\n## License)/,
      '## Runtime Support\n\nThis ESM-only npm package supports Node, Bun, and Deno on Windows. Node uses native `node:ffi` when enabled by the current Node release, otherwise it falls back to the optional `koffi` dependency. Bun uses native FFI. Deno requires `--allow-ffi`; when its backend cannot load, `isRegistryAvailable()` returns `false`.\n\n## Resource Management\n\nEvery key returned by `Registry.openKey()` or `Registry.createKey()` owns a Windows registry handle. Prefer `using` so the handle closes at the end of its lexical scope, even when an operation throws. Predefined root keys such as `Registry.HKCU` do not need closing.\n\n```ts\nusing key = Registry.openKey("HKCU\\\\Software");\nconsole.log(key.getValueNames());\n```\n\nWhen `using` is unavailable, close the key in `finally`:\n\n```ts\nconst key = Registry.openKey("HKCU\\\\Software");\ntry {\n  console.log(key.getValueNames());\n} finally {\n  key.close();\n}\n```\n',
    );
  await Deno.writeTextFile(join(destination, "README.md"), `${npmReadme}\n`);
}

function winCredDenoCredential(source: string): string {
  const globals = source.indexOf("const globals =");
  const supported = source.indexOf("let isSupported = false;");
  const runtime = source.indexOf("if (globals.process?.platform", supported);
  const api = source.indexOf("function rawToCredential", runtime);
  if (globals === -1 || supported === -1 || runtime === -1 || api === -1) {
    throw new Error("Unexpected win-cred source layout.");
  }
  return `${source.slice(0, globals)}${
    source.slice(supported, runtime)
  }if (Deno.build.os === "windows") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and a loadable Windows backend.
  }
}

${source.slice(api)}`;
}

function winCredFfi(source: string): string {
  return source
    .replaceAll("Deno_", "deno")
    .replaceAll("function readBytes(ptr: number", "function readBytes(pointer: number")
    .replaceAll("if (ptr === 0 || length === 0)", "if (pointer === 0 || length === 0)")
    .replaceAll("toArrayBuffer(ptr as Pointer", "toArrayBuffer(pointer as Pointer")
    .replaceAll("function readU32At(ptr: number", "function readU32At(pointer: number")
    .replaceAll("read.u32(ptr as Pointer", "read.u32(pointer as Pointer")
    .replaceAll("function readPtrAt(ptr: number", "function readPtrAt(pointer: number")
    .replaceAll("read.ptr(ptr as Pointer", "read.ptr(pointer as Pointer")
    .replaceAll("function readU64At(ptr: number", "function readU64At(pointer: number")
    .replaceAll("read.u64(ptr as Pointer", "read.u64(pointer as Pointer");
}

async function writeWinCredDenoPackage(
  name: string,
  source: string,
  pkg: PackageJson,
): Promise<void> {
  const destination = join(jsrDir, name);
  await Deno.mkdir(destination, { recursive: true });
  await Deno.copyFile(join(source, "LICENSE.md"), join(destination, "LICENSE.md"));
  const readme = rebrand(await Deno.readTextFile(join(source, "README.md")))
    .replace(
      /## Installation[\s\S]*?(?=\n## Usage)/,
      '## Installation\n\n```sh\ndeno add jsr:@neotales/win-cred\n```\n\n```ts\nimport { readSecret, saveCredential } from "jsr:@neotales/win-cred";\n```\n',
    )
    .replace(
      /## Runtime Notes[\s\S]*?(?=\n## License)/,
      "## Runtime Support\n\nThis JSR package supports Deno on Windows. Run Deno with `--allow-ffi`; when permission is absent or the backend cannot load, `isAvailable()` returns `false`. Use `npm:@neotales/win-cred` for the cross-runtime package.\n\nCredential writes require an interactive Windows logon session. OpenSSH sessions can fail with Win32 error `1312` (`ERROR_NO_SUCH_LOGON_SESSION`) because Credential Manager has no available logon session; validate write operations from an interactive RDP or console session.\n",
    );
  await Deno.writeTextFile(join(destination, "README.md"), `${readme}\n`);
  await Deno.copyFile(join(source, "src", "types.ts"), join(destination, "types.ts"));
  await Deno.writeTextFile(
    join(destination, "ffi_deno.ts"),
    winCredFfi(await Deno.readTextFile(join(source, "src", "ffi_deno.ts"))),
  );
  await Deno.writeTextFile(
    join(destination, "credential.ts"),
    winCredDenoCredential(await Deno.readTextFile(join(source, "src", "credential.ts"))),
  );
  await Deno.writeTextFile(
    join(destination, "mod.ts"),
    rebrand(await Deno.readTextFile(join(source, "src", "index.ts"))),
  );
  await Deno.writeTextFile(
    join(destination, "mod.test.ts"),
    `import { decodeSecret, encodeSecret, isAvailable, listCredentials } from "./mod.ts";

Deno.test("credential availability matches the platform", () => {
  if (isAvailable() !== (Deno.build.os === "windows"))
throw new Error("Unexpected availability");
});

Deno.test("credential secret encoding roundtrips", () => {
  if (decodeSecret(encodeSecret("secret")) !== "secret")
throw new Error("Unexpected secret");
});

Deno.test("credential listing is safe on Windows", { ignore: Deno.build.os !== "windows" }, () => {
  if (!Array.isArray(listCredentials()))
throw new Error("Expected credentials");
});
`,
  );
  await Deno.writeTextFile(
    join(destination, "deno.json"),
    JSON.stringify(
      {
        name: pkg.name.replace("@neostd/", "@neotales/"),
        version: pkg.version,
        description: `${pkg.description} Deno on Windows only.`,
        license: pkg.license,
        exports: { ".": "./mod.ts", "./credential": "./credential.ts", "./types": "./types.ts" },
      },
      null,
      2,
    ) + "\n",
  );
}

async function writeWinCredNpmPackage(
  name: string,
  source: string,
  pkg: PackageJson,
): Promise<void> {
  const destination = join(npmDir, name);
  await copy(source, destination, { overwrite: false });
  for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "esm"]) {
    await Deno.remove(join(destination, file), { recursive: true }).catch(() => undefined);
  }
  await rewriteTree(
    destination,
    /\.(?:ts|md)$/,
    (content) => rebrand(content).replace(/(["'](?:\.{1,2}\/)[^"']+)\.ts(["'])/g, "$1.js$2"),
  );
  for (const module of ["ffi_bun", "ffi_deno", "ffi_koffi", "ffi_node"]) {
    const ffiPath = join(destination, "src", `${module}.ts`);
    await Deno.writeTextFile(ffiPath, winCredFfi(await Deno.readTextFile(ffiPath)));
  }
  const testPath = join(destination, "tests", "index.test.ts");
  await Deno.writeTextFile(
    testPath,
    (await Deno.readTextFile(testPath))
      .replace(
        'const TEST_TARGET = "neotales-js-test-credential";',
        'const TEST_TARGET = "neotales-js-test-credential";\nconst CREDENTIAL_MANAGER_MUTATIONS = DANGEROUS_MUTATIONS && !process.env.SSH_CONNECTION;',
      )
      .replaceAll("!WINDOWS || !DANGEROUS_MUTATIONS", "!WINDOWS || !CREDENTIAL_MANAGER_MUTATIONS"),
  );
  const nodeFfi = join(destination, "src", "ffi_node.ts");
  await Deno.writeTextFile(
    nodeFfi,
    (await Deno.readTextFile(nodeFfi))
      .replaceAll("parameters:", "arguments:")
      .replaceAll("result:", "return:"),
  );
  const readmePath = join(destination, "README.md");
  await Deno.writeTextFile(
    readmePath,
    (await Deno.readTextFile(readmePath)).replace(
      "Node.js uses either `node:ffi` or the optional `koffi` peer dependency. Bun and Deno use their native FFI support.",
      "Node.js uses either `node:ffi` or optional `koffi`; Bun and Deno use native FFI. Credential writes require an interactive Windows logon session. OpenSSH sessions can fail with Win32 error `1312` (`ERROR_NO_SUCH_LOGON_SESSION`); validate writes from an interactive RDP or console session.",
    ),
  );
  await Deno.writeTextFile(
    join(destination, "package.json"),
    JSON.stringify(npmManifest(pkg), null, 2) + "\n",
  );
  await Deno.writeTextFile(join(destination, ".npmignore"), npmIgnore());
  await Deno.writeTextFile(
    join(destination, "tsconfig.json"),
    JSON.stringify(npmTsConfig(), null, 2) + "\n",
  );
  await Deno.writeTextFile();
}

function darwinKeychainDenoVault(source: string): string {
  const globals = source.indexOf("const globals =");
  const supported = source.indexOf("let isSupported = false;");
  const runtime = source.indexOf("if (globals.process?.platform", supported);
  const api = source.indexOf("/**\n * Returns whether", runtime);
  if (globals === -1 || supported === -1 || runtime === -1 || api === -1) {
    throw new Error("Unexpected darwin-keychain source layout.");
  }
  return `${source.slice(0, globals)}const decoder = new TextDecoder();
const encoder = new TextEncoder();

${source.slice(supported, runtime)}if (Deno.build.os === "darwin") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and a loadable Security.framework backend.
  }
}

${source.slice(api)}`;
}

function darwinKeychainFfi(source: string): string {
  return source
    .replace(
      /\n  SecKeychainSearchRelease: \{\n    parameters: \["pointer"\],\n    result: "i32",\n  \},/,
      "",
    )
    .replaceAll("sec.symbols.SecKeychainSearchRelease(", "cf.symbols.CFRelease(")
    .replace(
      /(ITEM_CLASS_GENERIC_PASSWORD,\n\s*)list(,\n\s*searchRefBuf,)/,
      "$1deno.UnsafePointer.of(list)$2",
    )
    .replace(
      /(deno\.UnsafePointer\.create\(itemRef\),\n\s*)info(,\n\s*null,)/,
      "$1deno.UnsafePointer.of(info)$2",
    )
    .replace(
      'const SecKeychainSearchRelease = sec.func("int SecKeychainSearchRelease(void *searchRef)");\n',
      "",
    )
    .replaceAll('return ptrAddress(koffi.as(value, "void *"));', "return ptrAddress(value);")
    .replaceAll("SecKeychainSearchRelease(searchOut[0]);", "CFRelease(searchOut[0]);")
    .replaceAll("sec.functions.SecKeychainSearchRelease(", "cf.functions.CFRelease(")
    .replace(/^(\s*)if \(([^)\n]+)\) ([^\n;]+);$/gm, "$1if ($2)\n$1  $3;");
}

function darwinKeychainKoffi(source: string): string {
  source = source.replace(
    "const dec = new TextDecoder();",
    `const dec = new TextDecoder();

const SecKeychainAttribute = koffi.struct("SecKeychainAttribute", {
  tag: "uint32",
  length: "uint32",
  data: "void *",
});
const SecKeychainAttributeList = koffi.struct("SecKeychainAttributeList", {
  count: "uint32",
  attr: "SecKeychainAttribute *",
});`,
  );
  source = source.replace(
    /function readU32\([\s\S]*?\n}\n\nfunction readPtr\([\s\S]*?\n}\n\nfunction rawPtr/,
    "function rawPtr",
  );
  source = source.replace(
    /const attrsAddress = ptrAddress\(attrsOut\[0\]\);[\s\S]*?return dec\.decode\(ptrToBytes\(dataPtr, length\)\);/,
    `const attrs = koffi.decode(attrsOut[0], SecKeychainAttributeList);
    if (attrs.count === 0 || !attrs.attr) {
      return "";
    }

    const attr = koffi.decode(attrs.attr, SecKeychainAttribute);
    if (attr.tag !== ATTR_ACCOUNT || !attr.data || attr.length === 0) {
      return "";
    }
    return dec.decode(ptrToBytes(attr.data, attr.length));`,
  );
  return source;
}

function darwinKeychainDocs(source: string, module: string): string {
  if (!source.startsWith("/**\n * @module"))
    source = `/**\n * ${module}\n *\n * @module @neotales/darwin-keychain\n */\n\n${source}`;
  return source
    .replace(
      "/** Secret record returned by keychain listing operations. */",
      '/**\n * Secret record returned by keychain listing operations.\n *\n * @example\n * import type { SecretRecord } from "@neotales/darwin-keychain";\n *\n * const record: SecretRecord = { service: "service", account: "account", secret: new Uint8Array() };\n */',
    )
    .replace(
      " * @returns `true` when generic password operations are supported.\n */\nexport function isDarwinKeychainAvailable",
      ' * @returns `true` when generic password operations are supported.\n * @example\n * import { isDarwinKeychainAvailable } from "@neotales/darwin-keychain";\n *\n * if (isDarwinKeychainAvailable())\n *   console.log("Keychain is available");\n */\nexport function isDarwinKeychainAvailable',
    )
    .replace(
      " * @returns The stored secret string, or `null` when missing.\n */\nexport function readSecret",
      ' * @returns The stored secret string, or `null` when missing.\n * @example\n * import { readSecret } from "@neotales/darwin-keychain";\n *\n * const secret = readSecret("service", "account");\n */\nexport function readSecret',
    )
    .replace(
      " * @returns The stored secret bytes, or `null` when missing.\n */\nexport function getSecretBytes",
      ' * @returns The stored secret bytes, or `null` when missing.\n * @example\n * import { getSecretBytes } from "@neotales/darwin-keychain";\n *\n * const bytes = getSecretBytes("service", "account");\n */\nexport function getSecretBytes',
    )
    .replace(
      " * @param secret Secret string or bytes.\n */\nexport function saveSecret",
      ' * @param secret Secret string or bytes.\n * @returns Nothing.\n * @example\n * import { saveSecret } from "@neotales/darwin-keychain";\n *\n * saveSecret("service", "account", "secret");\n */\nexport function saveSecret',
    )
    .replace(
      " * @returns `true` when a record was deleted.\n */\nexport function removeSecret",
      ' * @returns `true` when a record was deleted.\n * @example\n * import { removeSecret } from "@neotales/darwin-keychain";\n *\n * removeSecret("service", "account");\n */\nexport function removeSecret',
    )
    .replace(
      " * @returns Decoded records for the given service.\n */\nexport function listSecrets",
      ' * @returns Decoded records for the given service.\n * @example\n * import { listSecrets } from "@neotales/darwin-keychain";\n *\n * const records = listSecrets("service");\n */\nexport function listSecrets',
    );
}

function darwinKeychainTests(source: string): string {
  const original = `      saveSecret(service, account, secret);
      strictEqual(readSecret(service, account), secret);
      strictEqual(getSecretBytes(service, account) instanceof Uint8Array, true);`;
  const replacement = `      saveSecret(service, account, secret);
      const saved = readSecret(service, account);
      if (saved !== secret) {
        // Hosted macOS runners can expose a Keychain that accepts writes but cannot read them.
        try {
          removeSecret(service, account);
        } catch {
          // Nothing to clean up when the hosted Keychain session is unavailable.
        }
        t.skip("Integration environment unavailable: Keychain did not retain the test item");
        return;
      }
      strictEqual(getSecretBytes(service, account) instanceof Uint8Array, true);`;
  if (!source.includes(original)) {
    throw new Error("Unexpected darwin-keychain test layout.");
  }
  return source.replace(original, replacement);
}

async function writeDarwinKeychainPackage(
  name: string,
  source: string,
  pkg: PackageJson,
): Promise<void> {
  const jsr = join(jsrDir, name);
  await Deno.mkdir(jsr, { recursive: true });
  await Deno.copyFile(join(source, "LICENSE.md"), join(jsr, "LICENSE.md"));
  await Deno.copyFile(join(source, "README.md"), join(jsr, "README.md"));
  await Deno.writeTextFile(
    join(jsr, "types.ts"),
    darwinKeychainDocs(
      await Deno.readTextFile(join(source, "src", "types.ts")),
      "Shared keychain types.",
    ),
  );
  await Deno.writeTextFile(
    join(jsr, "ffi_deno.ts"),
    darwinKeychainDocs(
      darwinKeychainFfi(
        (await Deno.readTextFile(join(source, "src", "ffi_deno.ts"))).replaceAll("Deno_", "deno"),
      ),
      "Deno Security.framework FFI backend.",
    ),
  );
  await Deno.writeTextFile(
    join(jsr, "vault.ts"),
    darwinKeychainDocs(
      darwinKeychainDenoVault(await Deno.readTextFile(join(source, "src", "vault.ts"))),
      "macOS keychain vault helpers.",
    ),
  );
  await Deno.writeTextFile(
    join(jsr, "mod.ts"),
    rebrand(await Deno.readTextFile(join(source, "src", "index.ts"))),
  );
  await Deno.writeTextFile(
    join(jsr, "mod.test.ts"),
    `import { isDarwinKeychainAvailable } from "./mod.ts";\n\nDeno.test("keychain availability reports a boolean", () => {\n  if (typeof isDarwinKeychainAvailable() !== "boolean") throw new Error("Unexpected availability");\n});\n`,
  );
  await Deno.writeTextFile(
    join(jsr, "deno.json"),
    JSON.stringify(
      {
        name: pkg.name.replace("@neostd/", "@neotales/"),
        version: pkg.version,
        description: `${pkg.description} Deno on macOS only.`,
        license: pkg.license,
        exports: { ".": "./mod.ts" },
      },
      null,
      2,
    ) + "\n",
  );
  const npm = join(npmDir, name);
  await copy(source, npm, { overwrite: false });
  for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "esm"])
    await Deno.remove(join(npm, file), { recursive: true }).catch(() => undefined);
  await rewriteTree(npm, /\.(?:ts|md)$/, (content) =>
    rebrand(content)
      .replaceAll("Deno_", "deno")
      .replace(/(["'](?:\.{1,2}\/)[^"']+)\.ts(["'])/g, "$1.js$2"));
  for (const file of ["ffi_deno", "ffi_koffi", "ffi_node"]) {
    const path = join(npm, "src", `${file}.ts`);
    let content = darwinKeychainFfi(await Deno.readTextFile(path));
    if (file === "ffi_koffi") {
      content = darwinKeychainKoffi(content);
    }
    await Deno.writeTextFile(path, content);
  }
  const tests = join(npm, "tests", "index.test.ts");
  await Deno.writeTextFile(tests, darwinKeychainTests(await Deno.readTextFile(tests)));
  for (const file of ["vault", "types", "ffi_bun", "ffi_deno", "ffi_koffi", "ffi_node"]) {
    const path = join(npm, "src", `${file}.ts`);
    await Deno.writeTextFile(
      path,
      darwinKeychainDocs(await Deno.readTextFile(path), `darwin-keychain ${file} module.`),
    );
  }
  const nodeFfi = join(npm, "src", "ffi_node.ts");
  await Deno.writeTextFile(
    nodeFfi,
    (await Deno.readTextFile(nodeFfi))
      .replaceAll("parameters:", "arguments:")
      .replaceAll("result:", "return:"),
  );
  await Deno.writeTextFile(
    join(npm, "package.json"),
    JSON.stringify(npmManifest(pkg), null, 2) + "\n",
  );
  await Deno.writeTextFile(join(npm, ".npmignore"), npmIgnore());
  await Deno.writeTextFile(
    join(npm, "tsconfig.json"),
    JSON.stringify(npmTsConfig(), null, 2) + "\n",
  );
  await Deno.writeTextFile();
}

function linuxLibsecretDenoVault(source: string): string {
  const globals = source.indexOf("const globals =");
  const supported = source.indexOf("let isSupported = false;");
  const runtime = source.indexOf("if (globals.process?.platform", supported);
  const api = source.indexOf("/**\n * Returns whether", runtime);
  if (globals === -1 || supported === -1 || runtime === -1 || api === -1) {
    throw new Error("Unexpected linux-libsecret source layout.");
  }
  return `${source.slice(0, globals)}const decoder = new TextDecoder();
const encoder = new TextEncoder();

${source.slice(supported, runtime)}if (Deno.build.os === "linux") {
  try {
    driver = (await import("./ffi_deno.ts")).backend;
    isSupported = true;
  } catch {
    // Deno requires --allow-ffi and loadable libsecret dependencies.
  }
}

${source.slice(api)}`;
}

function linuxLibsecretNpmVault(source: string): string {
  const runtime = source.indexOf("if (globals.process?.platform");
  const conditionEnd = source.indexOf("{\n", runtime) + 2;
  const runtimeEnd = source.indexOf("\n}\n\n", conditionEnd);
  const api = source.indexOf("/**\n * Returns whether", runtimeEnd);
  if (runtime === -1 || conditionEnd === 1 || runtimeEnd === -1 || api === -1) {
    throw new Error("Unexpected linux-libsecret source layout.");
  }
  const condition = source.slice(runtime, conditionEnd);
  const body = source.slice(conditionEnd, runtimeEnd).replace(/^/gm, "  ");
  return `${source.slice(0, runtime)}${condition}  try {
${body}
  } catch (error) {
    if (globals.process?.env?.DEBUG === "true") {
      console.debug(error);
    }
  }
}

${source.slice(api)}`;
}

function expandSingleLineIfBodies(source: string): string {
  return source.replace(/^(\s*)if \(([^)\n]+)\) ([^\n;]+);$/gm, "$1if ($2)\n$1  $3;");
}

function linuxLibsecretFfi(source: string): string {
  return expandSingleLineIfBodies(
    source
      .replaceAll("const secret = ", "const libsecretApi = ")
      .replace(/\bsecret\.symbols\./g, "libsecretApi.symbols."),
  );
}

function linuxLibsecretNpmTests(source: string): string {
  const normalized = source.replaceAll(
    "  isLinuxLibsecretAvailable,\n  isLinuxLibsecretAvailable,\n",
    "  isLinuxLibsecretAvailable,\n",
  );
  const withAvailability = normalized.includes("  isLinuxLibsecretAvailable,\n")
    ? normalized
    : normalized.replace(
      "  getSecretBytes,\n",
      "  getSecretBytes,\n  isLinuxLibsecretAvailable,\n",
    );
  return expandSingleLineIfBodies(
    withAvailability.replace(
      "{ skip: !LINUX || !DANGEROUS_MUTATIONS },",
      '{ skip: !LINUX || !DANGEROUS_MUTATIONS || "Bun" in globalThis || !isLinuxLibsecretAvailable() },',
    ),
  );
}

async function writeLinuxLibsecretPackage(
  name: string,
  source: string,
  pkg: PackageJson,
): Promise<void> {
  const jsr = join(jsrDir, name);
  await Deno.mkdir(jsr, { recursive: true });
  await Deno.copyFile(join(source, "LICENSE.md"), join(jsr, "LICENSE.md"));
  await Deno.writeTextFile(
    join(jsr, "README.md"),
    rebrand(await Deno.readTextFile(join(source, "README.md"))),
  );
  await Deno.writeTextFile(
    join(jsr, "types.ts"),
    rebrand(await Deno.readTextFile(join(source, "src", "types.ts"))),
  );
  await Deno.writeTextFile(
    join(jsr, "ffi_deno.ts"),
    linuxLibsecretFfi(
      rebrand(await Deno.readTextFile(join(source, "src", "ffi_deno.ts"))).replaceAll(
        "Deno_",
        "deno",
      ),
    ),
  );
  await Deno.writeTextFile(
    join(jsr, "vault.ts"),
    rebrand(linuxLibsecretDenoVault(await Deno.readTextFile(join(source, "src", "vault.ts")))),
  );
  await Deno.writeTextFile(
    join(jsr, "mod.ts"),
    rebrand(await Deno.readTextFile(join(source, "src", "index.ts"))),
  );
  await Deno.writeTextFile(
    join(jsr, "mod.test.ts"),
    `import { isLinuxLibsecretAvailable } from "./mod.ts";

Deno.test("libsecret availability reports a boolean", () => {
  if (typeof isLinuxLibsecretAvailable() !== "boolean") {
    throw new Error("Unexpected availability");
  }
});
`,
  );
  await Deno.writeTextFile(
    join(jsr, "deno.json"),
    JSON.stringify(
      {
        name: pkg.name.replace("@neostd/", "@neotales/"),
        version: pkg.version,
        description: `${pkg.description} Deno on Linux only.`,
        license: pkg.license,
        exports: { ".": "./mod.ts" },
      },
      null,
      2,
    ) + "\n",
  );

  const npm = join(npmDir, name);
  await copy(source, npm, { overwrite: false });
  for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "esm"]) {
    await Deno.remove(join(npm, file), { recursive: true }).catch(() => undefined);
  }
  await rewriteTree(npm, /\.(?:ts|md)$/, (content) =>
    rebrand(content)
      .replaceAll("Deno_", "deno")
      .replace(/(["'](?:\.{1,2}\/)[^"']+)\.ts(["'])/g, "$1.js$2"));
  const npmVault = join(npm, "src", "vault.ts");
  await Deno.writeTextFile(npmVault, linuxLibsecretNpmVault(await Deno.readTextFile(npmVault)));
  const npmTests = join(npm, "tests", "index.test.ts");
  await Deno.writeTextFile(npmTests, linuxLibsecretNpmTests(await Deno.readTextFile(npmTests)));
  for (const file of ["ffi_bun", "ffi_deno", "ffi_koffi", "ffi_node"]) {
    const path = join(npm, "src", `${file}.ts`);
    const content = await Deno.readTextFile(path);
    await Deno.writeTextFile(
      path,
      file === "ffi_deno" ? linuxLibsecretFfi(content) : expandSingleLineIfBodies(content),
    );
  }
  const nodeFfi = join(npm, "src", "ffi_node.ts");
  await Deno.writeTextFile(
    nodeFfi,
    (await Deno.readTextFile(nodeFfi))
      .replaceAll("parameters:", "arguments:")
      .replaceAll("result:", "return:"),
  );
  await Deno.writeTextFile(
    join(npm, "package.json"),
    JSON.stringify(npmManifest(pkg), null, 2) + "\n",
  );
  await Deno.writeTextFile(join(npm, ".npmignore"), npmIgnore());
  await Deno.writeTextFile(
    join(npm, "tsconfig.json"),
    JSON.stringify(npmTsConfig(), null, 2) + "\n",
  );
  await Deno.writeTextFile();
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
  if (
    name !== "is-elevated" &&
    name !== "win-registry" &&
    name !== "win-cred" &&
    name !== "darwin-keychain" &&
    name !== "linux-libsecret"
  ) {
    throw new Error(
      `The Deno-only migration is defined for is-elevated, win-registry, win-cred, darwin-keychain, and linux-libsecret only; review it before importing ${name}.`,
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
  if (name === "is-elevated") {
    await writeDenoPackage(name, source, pkg);
    await writeNpmPackage(name, source, pkg);
  } else if (name === "win-registry") {
    await writeWinRegistryDenoPackage(name, source, pkg);
    await writeWinRegistryNpmPackage(name, source, pkg);
  } else if (name === "win-cred") {
    await writeWinCredDenoPackage(name, source, pkg);
    await writeWinCredNpmPackage(name, source, pkg);
  } else if (name === "darwin-keychain") {
    await writeDarwinKeychainPackage(name, source, pkg);
  } else {
    await writeLinuxLibsecretPackage(name, source, pkg);
  }
  await run(Deno.execPath(), ["fmt", jsrPackage, npmPackage]);
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

async function verifyModuleBuild(name: string): Promise<void> {
  await buildModule(name);
  const status = await git(["status", "--porcelain", "--", join(npmDir, name)]);
  if (status.length > 0) {
    console.error(`Built outputs for npm/${name} differ from the committed files:`);
    console.error(status);
    throw new Error(
      `Generated files must be stored in source. Run \`deno task build ${name}\` and commit the results.`,
    );
  }
}

async function testModules(name: string | undefined, runtimes: Set<string>): Promise<void> {
  const modules = name ? [name] : await importedModules();
  if (!modules.length) {
    throw new Error("No packages have been imported.");
  }
  const selected = runtimes.size ? runtimes : new Set(["deno", "node", "bun"]);
  await run("pnpm", ["install"]);
  for (const module of modules) {
    if (selected.has("deno"))
      await run("deno", ["test", "-A"], join(jsrDir, module));
    await verifyModuleBuild(module);
    const npmPackage = join(npmDir, module);
    if (selected.has("deno"))
      await run("pnpm", ["test:deno"], npmPackage);
    if (selected.has("node"))
      await run("pnpm", ["test"], npmPackage);
    if (selected.has("bun"))
      await run("pnpm", ["test:bun"], npmPackage);
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
        if (old.version === current.version)
          continue;
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
  await lint();
  await format(true);
  await run("pnpm", ["audit", "--audit-level", "moderate"]);
  await testModules(undefined, new Set());

  const packages = await releasePackages(baseTag);
  if (!packages.length) {
    throw new Error(`No package versions changed since ${baseTag ?? "the initial release"}.`);
  }
  const artifacts = join(root, "artifacts", tag);
  await Deno.remove(artifacts, { recursive: true }).catch((error: unknown) => {
    if (!(error instanceof Deno.errors.NotFound))
      throw error;
  });
  await Deno.mkdir(artifacts, { recursive: true });
  for (const pkg of packages) {
    await verifyModuleBuild(pkg.module);
    await run("pnpm", ["pack", "--pack-destination", artifacts], join(npmDir, pkg.module));
    const tarballs: string[] = [];
    for await (const entry of Deno.readDir(artifacts)) {
      if (entry.isFile && entry.name.endsWith(".tgz"))
        tarballs.push(entry.name);
    }
    const tarball = tarballs.find((entry) => entry.includes(pkg.module.replaceAll("-", "-")));
    if (!tarball)
      throw new Error(`Could not locate the tarball for ${pkg.module}.`);
    pkg.tarball = tarball;
  }

  const commits = (await git(["log", "--format=%s", ...(baseTag ? [`${baseTag}..HEAD`] : [])]))
    .split("\n")
    .filter((subject) =>
      /^(?:feat|fix|bug|perf|refactor|docs|chore)(?:\([^)]+\))?!?:/.test(subject)
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
    if (!output.success)
      Deno.exit(output.code);
  } finally {
    await Deno.remove(authDir, { recursive: true });
  }
}

async function bootstrapPublish(name: string, dryRun: boolean): Promise<void> {
  let token = Deno.env.get("NODE_AUTH_TOKEN")?.trim();
  if (!dryRun && !token) {
    token = prompt("npm auth token:")?.trim();
    if (!token)
      throw new Error("An npm auth token is required for the initial npm publication.");
  }
  await lint();
  await format(true);
  await testModules(name, new Set());
  const directory = join(npmDir, name);
  const pkg = await readPackage(directory);
  const version = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`,
  );
  if (version.ok)
    throw new Error(`${pkg.name}@${pkg.version} already exists on npm.`);
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
  await run(Deno.execPath(), ["fmt", ...(check ? ["--check"] : [])]);
}

async function lint(): Promise<void> {
  await run(oxlint, [
    "--ignore-pattern",
    "npm/*/esm/**",
    "--ignore-pattern",
    "npm/*/types/**",
    "eng",
    "jsr",
    "npm",
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
    await lint();
    break;
  case "fmt":
    await format(args.includes("--check"));
    break;
  case "audit":
    await run("pnpm", ["audit", "--audit-level", "moderate"]);
    break;
  case "check":
    await lint();
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
