# Neotales JavaScript OS Libraries

Operating-system-specific TypeScript modules published to JSR and npm. Each module is maintained
as two packages: a Deno-only JSR package in `jsr/` and a cross-runtime npm package in `npm/`.

## Modules

| Module            | Platforms | Description                                                                  |
| ----------------- | --------- | ---------------------------------------------------------------------------- |
| `is-elevated`     | All       | Detect whether the current process is running with elevated privileges.      |
| `win-registry`    | Windows   | Read and write the Windows Registry via FFI.                                 |
| `win-cred`        | Windows   | Windows Credential Manager read/write/list helpers.                          |
| `darwin-keychain` | macOS     | macOS Keychain secret storage helpers.                                       |
| `linux-libsecret` | Linux     | Secret storage backed by `libsecret` (GNOME Keyring/KWallet Secret Service). |

Planned modules are tracked in [docs/ROADMAP.md](./docs/ROADMAP.md).

## Workflow

```sh
deno task modules
deno task import <module>
deno task build <module>
deno task test <module>
deno task test <module> --deno
deno task test <module> --node --bun
deno task test:remote --ssh user@host <module>
```

`modules` lists the upstream packages and their import state. `import` imports one package from
`~/foss/js/os` at a time; set `OS_MODULES` to use another source directory. The JSR package keeps
only its Deno implementation and documents that Deno-only scope. The npm package keeps its
runtime-specific `src/*.ts` files, compiles them to `esm/` and `types/` with TypeScript, generates
its export map from the upstream manifest, and uses optional `koffi` for Node versions without
native FFI.

The package split avoids dnt. FFI requires static `node:ffi` and `bun:ffi` imports for IntelliSense,
but dnt cannot reliably transform or resolve those runtime-only specifiers. Deno users should use
the JSR package for Deno-only APIs, or `npm:@neotales/<module>` when they need the cross-runtime npm
package. Node uses native FFI when available and otherwise falls back to optional `koffi`; Bun and
the npm package running under Deno use their native FFI APIs.

`test:remote` archives the local repository (excluding dependencies, artifacts, and Git metadata),
replaces `~/work/os` on the SSH target, and runs the selected modules through `mise`. Omit module
arguments to test every imported module. A remote test failure makes the local task fail.

## Quality

```sh
pnpm install
deno task lint
deno task fmt:check
deno task check
deno task pack <module>
deno task release:prepare <tag>
deno task publish:bootstrap <module>
```

The engineering tasks use Deno, TypeScript, `oxlint`, `deno fmt` (100-column width), and `pnpm`. npm
`esm/` and `types/` output is generated and must not be edited directly.

## Releases

Release tags use `vYYYY.MM.DD-rN`, with optional `-nightly.rN` and `-beta.rN` prerelease forms.
`deno task release:prepare <tag>` runs the quality gate, selects packages whose JSR version changed
since the prior release tag, and writes npm tarballs plus release metadata to `artifacts/<tag>/`.

The first npm publication must be token-based because npm trusted publishing is configured on an
existing package. Run `NODE_AUTH_TOKEN=... deno task publish:bootstrap <module>` once after
reviewing its tarball. Then configure npm trusted publishing for `release.yml`, the `release`
environment, and this repository; later tag releases publish npm packages with GitHub OIDC and
`--provenance`. JSR publication uses GitHub Actions OIDC (`id-token: write`) via `deno publish`,
as recommended by jsr.io, so no JSR token is required.

## License

[MIT](./LICENSE.md)
