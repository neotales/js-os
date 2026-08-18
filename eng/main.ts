import { build, emptyDir, type EntryPoint } from "@deno/dnt";
import { copy } from "@std/fs";
import { join, relative, resolve } from "@std/path";

const root = resolve(import.meta.dirname!, "..");
const upstream = resolve(
  (Deno.env.get("OS_MODULES") ?? "~/foss/js/os").replace(/^~(?=\/)/, Deno.env.get("HOME") ?? ""),
);
const jsrDir = join(root, "jsr");
const npmDir = join(root, "npm");
const oxfmt = join(root, "node_modules", ".bin", "oxfmt");
const oxlint = join(root, "node_modules", ".bin", "oxlint");
const repository = "https://github.com/neotales/js-os";

type PackageJson = {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  license?: string;
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type DenoConfig = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  exports: Record<string, string>;
};

function usage(): never {
  console.error(`Usage: deno task <task> [module] [--deno] [--node] [--bun]

Tasks:
  import <module>       Import one upstream OS package
  modules               List available packages and import state
  normalize [module]    Reapply source migration transformations
  build <module>        Build one npm package with dnt
  test [module] [runtime]  Run Deno, Node, and Bun tests
  lint                  Check source with oxlint
  fmt [--check]         Format or check formatting with oxfmt
  audit                 Audit npm dependencies
  check                 Run lint, formatting, audit, and all tests
  pack <module>         Create an npm tarball`);
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
    if (error instanceof Deno.errors.NotFound) return false;
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

async function readPackage(directory: string): Promise<PackageJson> {
  return JSON.parse(await Deno.readTextFile(join(directory, "package.json"))) as PackageJson;
}

function rebrand(value: string): string {
  return value
    .replaceAll("@neostd/", "@neotales/")
    .replaceAll("github.com/neostd/js", "github.com/neotales/js-os")
    .replaceAll("raw.githubusercontent.com/neostd/js", "raw.githubusercontent.com/neotales/js-os")
    .replaceAll("../src/index.ts", "./mod.ts")
    .replaceAll("../src/", "./")
    .replaceAll("./index.ts", "./mod.ts");
}

function sourceExports(pkg: PackageJson): Record<string, string> {
  const exports: Record<string, string> = { ".": "./mod.ts" };
  for (const name of Object.keys(pkg.exports ?? {})) {
    if (name === "." || name === "./package.json") continue;
    exports[name] = `./${name.slice(2)}.ts`;
  }
  return exports;
}

function npmDependencies(
  dependencies?: Record<string, string>,
): Record<string, string> | undefined {
  if (!dependencies) return undefined;
  const result = Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name.replace("@neostd/", "@neotales/"),
      version,
    ]),
  );
  return Object.keys(result).length ? result : undefined;
}

async function flatten(
  directory: string,
  sourceDirectory: string,
  renameIndex: boolean,
): Promise<void> {
  if (!(await exists(sourceDirectory))) return;
  for await (const entry of Deno.readDir(sourceDirectory)) {
    if (!entry.isFile)
      throw new Error(`Nested upstream directories are not supported: ${sourceDirectory}`);
    const name =
      renameIndex && entry.name === "index.ts"
        ? "mod.ts"
        : renameIndex && entry.name === "index.test.ts"
          ? "mod.test.ts"
          : entry.name;
    await Deno.rename(join(sourceDirectory, entry.name), join(directory, name));
  }
  await Deno.remove(sourceDirectory);
}

async function rewritePackage(directory: string, pkg: PackageJson): Promise<void> {
  await flatten(directory, join(directory, "src"), true);
  await flatten(directory, join(directory, "tests"), true);
  for (const file of ["package.json", "vite.config.ts", "tsconfig.json", "esm"]) {
    await Deno.remove(join(directory, file), { recursive: true }).catch((error: unknown) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }

  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile || !/\.(?:ts|md)$/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    await Deno.writeTextFile(path, rebrand(await Deno.readTextFile(path)));
  }

  const koffi = pkg.peerDependencies?.koffi;
  const optionalDependencies = { ...pkg.optionalDependencies, ...(koffi ? { koffi } : {}) };
  const dnt = {
    description: pkg.description,
    keywords: pkg.keywords,
    dependencies: npmDependencies(pkg.dependencies),
    optionalDependencies: npmDependencies(optionalDependencies),
  };
  await Deno.writeTextFile(join(directory, "dnt.json"), JSON.stringify(dnt, null, 2) + "\n");
  const config: DenoConfig = {
    name: pkg.name.replace("@neostd/", "@neotales/"),
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    exports: sourceExports(pkg),
  };
  await Deno.writeTextFile(join(directory, "deno.json"), JSON.stringify(config, null, 2) + "\n");
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
    if (entry.isDirectory && (await exists(join(jsrDir, entry.name, "deno.json"))))
      modules.push(entry.name);
  }
  return modules.sort();
}

async function importModule(name: string): Promise<void> {
  const source = join(upstream, name);
  const destination = join(jsrDir, name);
  if (!(await exists(join(source, "package.json"))))
    throw new Error(`Unknown upstream package: ${name}`);
  if (await exists(destination)) throw new Error(`Package already imported: ${name}`);
  const pkg = await readPackage(source);
  await copy(source, destination, { overwrite: false });
  await rewritePackage(destination, pkg);
  await run(oxfmt, ["--write", destination]);
  console.log(`Imported ${name}. Review it before running: deno task build ${name}`);
}

async function normalize(names: string[]): Promise<void> {
  const modules = names.length ? names : await importedModules();
  for (const name of modules) {
    const directory = join(jsrDir, name);
    if (!(await exists(join(directory, "deno.json"))))
      throw new Error(`Unknown imported package: ${name}`);
    const config = JSON.parse(await Deno.readTextFile(join(directory, "deno.json"))) as DenoConfig;
    const dnt = JSON.parse(await Deno.readTextFile(join(directory, "dnt.json"))) as PackageJson;
    await Deno.writeTextFile(join(directory, "deno.json"), JSON.stringify(config, null, 2) + "\n");
    await Deno.writeTextFile(join(directory, "dnt.json"), JSON.stringify(dnt, null, 2) + "\n");
    await run(oxfmt, ["--write", directory]);
  }
}

async function buildModule(name: string): Promise<void> {
  const source = join(jsrDir, name);
  const configPath = join(source, "deno.json");
  if (!(await exists(configPath))) throw new Error(`Unknown imported package: ${name}`);
  const config = JSON.parse(await Deno.readTextFile(configPath)) as DenoConfig;
  const dnt = JSON.parse(await Deno.readTextFile(join(source, "dnt.json"))) as PackageJson;
  const entryPoints: EntryPoint[] = Object.entries(config.exports).map(([entryName, path]) => ({
    name: entryName,
    path,
  }));
  const outDir = join(npmDir, name);
  await emptyDir(outDir);
  const cwd = Deno.cwd();
  try {
    Deno.chdir(source);
    await build({
      entryPoints,
      outDir,
      declaration: "separate",
      esModule: true,
      scriptModule: false,
      skipSourceOutput: true,
      packageManager: "pnpm",
      test: true,
      shims: { deno: false },
      package: {
        name: config.name,
        version: config.version,
        description: config.description,
        keywords: dnt.keywords,
        license: config.license ?? "MIT",
        type: "module",
        repository: { type: "git", url: `git+${repository}.git`, directory: `npm/${name}` },
        bugs: { url: `${repository}/issues` },
        homepage: repository,
        engines: { node: ">=22" },
        scripts: { test: "node --test", "test:bun": "bun test" },
        dependencies: dnt.dependencies,
        optionalDependencies: dnt.optionalDependencies,
      },
      postBuild() {
        for (const file of ["README.md", "LICENSE.md"])
          Deno.copyFileSync(join(source, file), join(outDir, file));
      },
    });
  } catch (error) {
    await emptyDir(outDir);
    throw error;
  } finally {
    Deno.chdir(cwd);
  }
  console.log(`Built ${config.name} in ${relative(root, outDir)}`);
}

async function testModules(name: string | undefined, runtimes: Set<string>): Promise<void> {
  const modules = name ? [name] : await importedModules();
  if (!modules.length) throw new Error("No packages have been imported.");
  const selected = runtimes.size ? runtimes : new Set(["deno", "node", "bun"]);
  if (selected.has("node") || selected.has("bun")) await run("pnpm", ["install"]);
  for (const module of modules) {
    if (selected.has("deno")) await run("deno", ["test", "-A"], join(jsrDir, module));
    if (selected.has("node") || selected.has("bun")) await buildModule(module);
    if (selected.has("node")) await run("pnpm", ["test"], join(npmDir, module));
    if (selected.has("bun")) await run("pnpm", ["test:bun"], join(npmDir, module));
  }
}

async function format(check: boolean): Promise<void> {
  await run(oxfmt, [
    check ? "--check" : "--write",
    "--ignore-path",
    ".prettierignore",
    "eng",
    "jsr",
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
const name = moduleName(args, ["import", "build", "pack"].includes(command));
switch (command) {
  case "import":
    await importModule(name!);
    break;
  case "modules": {
    const imported = new Set(await importedModules());
    for (const module of await upstreamModules())
      console.log(`${imported.has(module) ? "imported" : "pending"} ${module}`);
    break;
  }
  case "normalize":
    await normalize(name ? [name] : []);
    break;
  case "build":
    await buildModule(name!);
    break;
  case "test": {
    const runtimes = new Set(args.filter((arg) => arg.startsWith("--")).map((arg) => arg.slice(2)));
    const invalid = [...runtimes].filter((runtime) => !["deno", "node", "bun"].includes(runtime));
    if (invalid.length) throw new Error(`Unknown runtime: --${invalid.join(", --")}`);
    await testModules(name, runtimes);
    break;
  }
  case "lint":
    await run(oxlint, ["eng", "jsr"]);
    break;
  case "fmt":
    await format(args.includes("--check"));
    break;
  case "audit":
    await run("pnpm", ["audit", "--audit-level", "moderate"]);
    break;
  case "check":
    await run(oxlint, ["eng", "jsr"]);
    await format(true);
    await run("pnpm", ["audit", "--audit-level", "moderate"]);
    await testModules(undefined, new Set());
    break;
  case "pack":
    await buildModule(name!);
    await run("pnpm", ["pack"], join(npmDir, name!));
    break;
  default:
    usage();
}
