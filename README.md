# Neotales JavaScript OS Libraries

Operating-system-specific TypeScript modules published to JSR and npm. The canonical source for
every package lives in `jsr/`; `npm/` contains generated Node packages.

## Workflow

```sh
deno task modules
deno task import <module>
deno task build <module>
deno task test <module>
deno task test <module> --deno
deno task test <module> --node --bun
```

`modules` lists the upstream packages and their import state. `import` only imports one package
from `~/foss/js/os` at a time; set `OS_MODULES` to use another source directory. The importer
flattens `src/` and `tests/` into the JSR package root (`mod.ts`, implementation files, and
`*.test.ts`), rewrites the package scope to `@neotales`, creates `deno.json` and `dnt.json`, and
moves `koffi` from a peer dependency to an npm optional dependency.

Node uses its native `node:ffi` API when it is available. Older Node versions fall back to the
optional `koffi` dependency; Deno and Bun use their native FFI APIs. OS-specific operations remain
safe no-ops or report unavailable support on other platforms.

## Quality

```sh
pnpm install
deno task lint
deno task fmt:check
deno task check
deno task pack <module>
```

The engineering tasks use Deno, dnt, `oxlint`, `oxfmt`, and `pnpm`. npm output is generated from
the JSR TypeScript source and must not be edited directly.

## License

[MIT](./LICENSE.md)
