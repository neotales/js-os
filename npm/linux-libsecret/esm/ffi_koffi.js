import process from "node:process";
import { GCancellableHandle, prepareGCancellable, prepareLibsecretError, releaseGCancellable, SecretPasswordHandle, SecretSchemaHandle, setLibsecretError, } from "./types.js";
const { createRequire } = process.getBuiltinModule("node:module");
const require = createRequire(import.meta.url ?? "file:///");
const koffi = require("koffi");
const libsecret = koffi.load("libsecret-1.so.0");
const glib = koffi.load("libglib-2.0.so.0");
const gobject = koffi.load("libgobject-2.0.so.0");
const gio = (() => {
    try {
        return koffi.load("libgio-2.0.so.0");
    }
    catch {
        return undefined;
    }
})();
const GLIST = koffi.struct("GList", { data: "void *", next: "void *", prev: "void *" });
const GERROR = koffi.struct("GError", { domain: "uint32", code: "int", message: "str" });
const secret_schema_new = libsecret.func("void * secret_schema_new(const char *name, uint32 flags, const char *attr1, uint32 type1, const char *attr2, uint32 type2, void *end)");
const secret_password_lookup_sync = libsecret.func("void * secret_password_lookup_sync(void *schema, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, const char *attr2, const char *val2, void *end)");
const secret_password_store_sync = libsecret.func("int secret_password_store_sync(void *schema, const char *collection, const char *label, const char *password, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, const char *attr2, const char *val2, void *end)");
const secret_password_clear_sync = libsecret.func("int secret_password_clear_sync(void *schema, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, const char *attr2, const char *val2, void *end)");
const secret_password_search_sync = libsecret.func("void * secret_password_search_sync(void *schema, uint32 flags, void *cancellable, _Out_ void **error, const char *attr1, const char *val1, void *end)");
const secret_retrievable_get_attributes = libsecret.func("void * secret_retrievable_get_attributes(void *retrievable)");
const secret_retrievable_retrieve_secret_sync = libsecret.func("void * secret_retrievable_retrieve_secret_sync(void *retrievable, void *cancellable, _Out_ void **error)");
const secret_value_get = libsecret.func("str secret_value_get(void *value, _Out_ uint64 *length)");
const secret_value_unref = libsecret.func("void secret_value_unref(void *value)");
const secret_password_free = libsecret.func("void secret_password_free(void *password)");
const g_error_free = glib.func("void g_error_free(void *error)");
const g_hash_table_lookup = glib.func("str g_hash_table_lookup(void *hash_table, const char *key)");
const g_hash_table_unref = glib.func("void g_hash_table_unref(void *hash_table)");
const g_list_free = glib.func("void g_list_free(void *list)");
const g_object_unref = gobject.func("void g_object_unref(void *object)");
const g_cancellable_new = gio?.func("void * g_cancellable_new(void)");
const g_cancellable_cancel = gio?.func("void g_cancellable_cancel(void *cancellable)");
const encoder = new TextEncoder();
const runtime = "koffi";
let listSchema = null;
function pointer(handle) {
    if (handle.runtime !== runtime)
        throw new TypeError("Libsecret handle belongs to a different runtime.");
    return handle.valueOf();
}
function cancellablePointer(handle) {
    prepareGCancellable(handle, runtime);
    return handle.valueOf();
}
function throwIfError(errorOut) {
    if (!errorOut[0])
        return;
    try {
        const error = koffi.decode(errorOut[0], GERROR);
        throw new Error(error.message || "Unknown libsecret error");
    }
    finally {
        g_error_free(errorOut[0]);
    }
}
function captureError(errorOut, errorStorage) {
    if (!errorStorage[0])
        return;
    try {
        const error = koffi.decode(errorStorage[0], GERROR);
        setLibsecretError(errorOut, new Error(error.message || "Unknown libsecret error"));
    }
    finally {
        g_error_free(errorStorage[0]);
    }
}
function secretSchemaNew(name, flags, attributeName1, attributeType1, attributeName2, attributeType2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    const value = secret_schema_new(name, flags, attributeName1, attributeType1, attributeName2, attributeType2, terminator);
    return value === null ? null : new SecretSchemaHandle(runtime, value);
}
function secretPasswordLookupSync(schema, cancellable, errorOut, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    prepareLibsecretError(errorOut, runtime);
    const errorStorage = [null];
    const value = secret_password_lookup_sync(pointer(schema), cancellable === null ? null : cancellablePointer(cancellable), errorStorage, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator);
    captureError(errorOut, errorStorage);
    return value === null
        ? null
        : new SecretPasswordHandle(runtime, value, koffi.decode(value, "str"));
}
function secretPasswordStoreSync(schema, collection, label, password, cancellable, errorOut, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    prepareLibsecretError(errorOut, runtime);
    const errorStorage = [null];
    const stored = secret_password_store_sync(pointer(schema), collection, label, password, cancellable === null ? null : cancellablePointer(cancellable), errorStorage, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator);
    captureError(errorOut, errorStorage);
    return Boolean(stored);
}
function secretPasswordClearSync(schema, cancellable, errorOut, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    prepareLibsecretError(errorOut, runtime);
    const errorStorage = [null];
    const cleared = secret_password_clear_sync(pointer(schema), cancellable === null ? null : cancellablePointer(cancellable), errorStorage, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator);
    captureError(errorOut, errorStorage);
    return Boolean(cleared);
}
function secretPasswordFree(password) {
    secret_password_free(pointer(password));
}
function cancellableNew() {
    if (g_cancellable_new === undefined)
        throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
    const cancellable = g_cancellable_new();
    if (cancellable === null)
        throw new Error("Failed to create GCancellable.");
    return new GCancellableHandle(runtime, cancellable);
}
function cancellableCancel(cancellable) {
    if (g_cancellable_cancel === undefined)
        throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
    g_cancellable_cancel(cancellablePointer(cancellable));
}
function cancellableRelease(cancellable) {
    if (gio === undefined)
        throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
    const pointer = cancellablePointer(cancellable);
    releaseGCancellable(cancellable, runtime);
    g_object_unref(pointer);
}
function getListSchema() {
    if (listSchema === null) {
        const schema = secretSchemaNew("org.freedesktop.Secret.Generic", 0, "service", 0, "account", 0, null);
        if (schema === null)
            throw new Error("Failed to create libsecret schema.");
        listSchema = schema;
    }
    return listSchema;
}
function listPointer(value, offset) {
    const node = koffi.decode(value, GLIST);
    return offset === 0 ? node.data : node.next;
}
function listSecretRecords(service) {
    const errorOut = [null];
    const list = secret_password_search_sync(pointer(getListSchema()), 2, null, errorOut, "service", service, null);
    throwIfError(errorOut);
    if (!list)
        return [];
    const records = [];
    try {
        for (let node = list; node; node = listPointer(node, 8)) {
            const retrievable = listPointer(node, 0);
            if (!retrievable)
                continue;
            const attributes = secret_retrievable_get_attributes(retrievable);
            try {
                const account = g_hash_table_lookup(attributes, "account");
                if (!account)
                    continue;
                const secretError = [null];
                const value = secret_retrievable_retrieve_secret_sync(retrievable, null, secretError);
                throwIfError(secretError);
                if (!value)
                    continue;
                try {
                    const secret = secret_value_get(value, [0n]);
                    if (secret)
                        records.push({ service, account, secret: encoder.encode(secret) });
                }
                finally {
                    secret_value_unref(value);
                }
            }
            finally {
                g_hash_table_unref(attributes);
            }
        }
    }
    finally {
        for (let node = list; node; node = listPointer(node, 8)) {
            const retrievable = listPointer(node, 0);
            if (retrievable)
                g_object_unref(retrievable);
        }
        g_list_free(list);
    }
    return records;
}
export const backend = {
    runtime,
    secretSchemaNew,
    secretPasswordLookupSync,
    secretPasswordStoreSync,
    secretPasswordClearSync,
    secretPasswordFree,
    ...(gio === undefined ? {} : {
        gio: { cancellableNew, cancellableCancel, cancellableRelease },
    }),
    listSecretRecords,
};
