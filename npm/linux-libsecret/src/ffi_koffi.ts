import process from "node:process";
import type { LinuxKeyringBackend, SecretRecord } from "./types.js";

const { createRequire } = process.getBuiltinModule("node:module");
const req = createRequire(import.meta.url ?? "file:///");
const koffi = req("koffi");

const libsecret = koffi.load("libsecret-1.so.0");
const glib = koffi.load("libglib-2.0.so.0");

const GLIST = koffi.struct("GList", {
  data: "void *",
  next: "void *",
  prev: "void *",
});

const GERROR = koffi.struct("GError", {
  domain: "uint32",
  code: "int",
  message: "str",
});

const secret_schema_new = libsecret.func(
  "void * secret_schema_new(const char *name, uint32 flags, const char *attr1, uint32 type1, const char *attr2, uint32 type2, void *end)",
);

const secret_password_lookup_sync = libsecret.func(
  "str secret_password_lookup_sync(void *schema, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, const char *attr2, const char *val2, void *end)",
);

const secret_password_store_sync = libsecret.func(
  "int secret_password_store_sync(void *schema, const char *collection, const char *label, const char *password, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, const char *attr2, const char *val2, void *end)",
);

const secret_password_clear_sync = libsecret.func(
  "int secret_password_clear_sync(void *schema, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, const char *attr2, const char *val2, void *end)",
);

const secret_password_search_sync = libsecret.func(
  "void * secret_password_search_sync(void *schema, uint32 flags, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, void *end)",
);

const secret_retrievable_get_attributes = libsecret.func(
  "void * secret_retrievable_get_attributes(void *retrievable)",
);

const secret_retrievable_retrieve_secret_sync = libsecret.func(
  "void * secret_retrievable_retrieve_secret_sync(void *retrievable, void *cancellable, _Out_ void **error)",
);

const secret_value_get = libsecret.func("str secret_value_get(void *value, _Out_ uint64 *length)");

const secret_value_unref = libsecret.func("void secret_value_unref(void *value)");

const g_error_free = glib.func("void g_error_free(void *error)");
const g_hash_table_lookup = glib.func("str g_hash_table_lookup(void *hash_table, const char *key)");
const g_hash_table_unref = glib.func("void g_hash_table_unref(void *hash_table)");
const g_list_free = glib.func("void g_list_free(void *list)");
const g_object_unref = koffi.load("libgobject-2.0.so.0").func("void g_object_unref(void *object)");

const dec = new TextDecoder();
const enc = new TextEncoder();

let schemaPtr: unknown = null;

function readErrorMessage(errorPtr: unknown): string {
  try {
    const error = koffi.decode(errorPtr, GERROR) as { message?: string };
    if (error.message)
      return error.message;
  } catch {
    // Preserve the original libsecret failure path even when Koffi cannot decode GError.
  }
  return "Unknown libsecret error";
}

function throwIfError(errorOut: unknown[]): void {
  if (!errorOut[0])
    return;
  const msg = readErrorMessage(errorOut[0]);
  g_error_free(errorOut[0]);
  throw new Error(msg);
}

function getSchema(): unknown {
  if (schemaPtr !== null)
    return schemaPtr;
  schemaPtr = secret_schema_new(
    "org.freedesktop.Secret.Generic",
    0,
    "service",
    0,
    "account",
    0,
    null,
  );
  return schemaPtr;
}

function ptrAt(ptrValue: unknown, offset: number): unknown {
  const node = koffi.decode(ptrValue, GLIST);
  return offset === 0 ? node.data : node.next;
}

export const backend: LinuxKeyringBackend = {
  getSecretBytes(service: string, account: string): Uint8Array | null {
    const errorOut: unknown[] = [null];
    const value = secret_password_lookup_sync(
      getSchema(),
      null,
      errorOut,
      "service",
      service,
      "account",
      account,
      null,
    );
    throwIfError(errorOut);
    if (value === null)
      return null;
    return enc.encode(value);
  },

  setSecretBytes(service: string, account: string, secret: Uint8Array): void {
    const errorOut: unknown[] = [null];
    const ok = secret_password_store_sync(
      getSchema(),
      "default",
      `${service}/${account}`,
      dec.decode(secret),
      null,
      errorOut,
      "service",
      service,
      "account",
      account,
      null,
    );
    throwIfError(errorOut);
    if (!ok)
      throw new Error("Failed to store secret");
  },

  deleteSecret(service: string, account: string): boolean {
    const errorOut: unknown[] = [null];
    const ok = secret_password_clear_sync(
      getSchema(),
      null,
      errorOut,
      "service",
      service,
      "account",
      account,
      null,
    );
    throwIfError(errorOut);
    return !!ok;
  },

  list(serviceName: string): SecretRecord[] {
    const errorOut: unknown[] = [null];
    const list = secret_password_search_sync(
      getSchema(),
      2,
      null,
      errorOut,
      "service",
      serviceName,
      null,
    );
    throwIfError(errorOut);
    if (!list)
      return [];

    const results: SecretRecord[] = [];
    try {
      for (let node: unknown = list; node; node = ptrAt(node, 8)) {
        const retrievable = ptrAt(node, 0);
        if (!retrievable)
          continue;

        const attributes = secret_retrievable_get_attributes(retrievable);
        try {
          const accountPtr = g_hash_table_lookup(attributes, "account");
          if (!accountPtr)
            continue;

          const secretErrorOut: unknown[] = [null];
          const value = secret_retrievable_retrieve_secret_sync(retrievable, null, secretErrorOut);
          throwIfError(secretErrorOut);
          if (!value)
            continue;

          try {
            const lengthOut: unknown[] = [0n];
            const secretPtr = secret_value_get(value, lengthOut);
            if (!secretPtr)
              continue;
            results.push({
              service: serviceName,
              account: accountPtr,
              secret: secretPtr,
            });
          } finally {
            secret_value_unref(value);
          }
        } finally {
          g_hash_table_unref(attributes);
        }
      }
    } finally {
      for (let node: unknown = list; node; node = ptrAt(node, 8)) {
        const retrievable = ptrAt(node, 0);
        if (retrievable)
          g_object_unref(retrievable);
      }
      g_list_free(list);
    }

    return results;
  },
};
