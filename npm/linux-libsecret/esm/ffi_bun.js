import { dlopen, ptr, read } from "bun:ffi";
import { GCancellableHandle, prepareGCancellable, prepareLibsecretError, releaseGCancellable, SecretPasswordHandle, SecretSchemaHandle, setLibsecretError, } from "./types.js";
const libsecret = dlopen("libsecret-1.so.0", {
    secret_schema_new: { args: ["ptr", "u32", "ptr", "u32", "ptr", "u32", "ptr"], returns: "ptr" },
    secret_password_lookup_sync: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "ptr",
    },
    secret_password_store_sync: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    secret_password_clear_sync: {
        args: ["ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr", "ptr"],
        returns: "i32",
    },
    secret_password_free: { args: ["ptr"], returns: "void" },
});
const glib = dlopen("libglib-2.0.so.0", { g_error_free: { args: ["ptr"], returns: "void" } });
const gio = (() => {
    try {
        return dlopen("libgio-2.0.so.0", {
            g_cancellable_new: { args: [], returns: "ptr" },
            g_cancellable_cancel: { args: ["ptr"], returns: "void" },
        });
    }
    catch {
        return undefined;
    }
})();
const gobject = dlopen("libgobject-2.0.so.0", {
    g_object_unref: { args: ["ptr"], returns: "void" },
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const runtime = "bun";
function cstr(value) {
    const bytes = encoder.encode(value);
    const result = new Uint8Array(bytes.length + 1);
    result.set(bytes);
    return result;
}
function readCString(pointer) {
    const bytes = [];
    for (let index = 0;; index++) {
        const value = read.u8(pointer, index);
        if (value === 0)
            return new Uint8Array(bytes);
        bytes.push(value);
    }
}
function schemaPointer(handle) {
    const pointer = handle.valueOf();
    if (handle.runtime !== runtime || typeof pointer !== "number")
        throw new TypeError("Secret schema handle belongs to a different runtime.");
    return pointer;
}
function passwordPointer(handle) {
    const pointer = handle.valueOf();
    if (handle.runtime !== runtime || typeof pointer !== "number")
        throw new TypeError("Secret password handle belongs to a different runtime.");
    return pointer;
}
function cancellablePointer(handle) {
    prepareGCancellable(handle, runtime);
    if (typeof handle.valueOf() !== "number")
        throw new TypeError("GCancellable handle belongs to a different runtime.");
    return handle.valueOf();
}
function captureError(errorOut, errorStorage) {
    const error = new DataView(errorStorage.buffer, errorStorage.byteOffset, errorStorage.byteLength)
        .getBigUint64(0, true);
    if (error === 0n)
        return;
    const pointer = Number(error);
    let message = "Unknown libsecret error";
    try {
        const messagePointer = read.ptr(pointer, 8);
        message = messagePointer === null ? message : decoder.decode(readCString(messagePointer));
    }
    finally {
        glib.symbols.g_error_free(pointer);
    }
    setLibsecretError(errorOut, new Error(message || "Unknown libsecret error"));
}
function secretSchemaNew(name, flags, attributeName1, attributeType1, attributeName2, attributeType2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    const pointer = libsecret.symbols.secret_schema_new(ptr(cstr(name)), flags, ptr(cstr(attributeName1)), attributeType1, ptr(cstr(attributeName2)), attributeType2, terminator);
    return pointer === null ? null : new SecretSchemaHandle(runtime, pointer);
}
function secretPasswordLookupSync(schema, cancellable, errorOut, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    prepareLibsecretError(errorOut, runtime);
    const errorStorage = new Uint8Array(8);
    const pointer = libsecret.symbols.secret_password_lookup_sync(schemaPointer(schema), cancellable === null ? null : cancellablePointer(cancellable), ptr(errorStorage), ptr(cstr(attributeName1)), ptr(cstr(attributeValue1)), ptr(cstr(attributeName2)), ptr(cstr(attributeValue2)), terminator);
    captureError(errorOut, errorStorage);
    return pointer === null
        ? null
        : new SecretPasswordHandle(runtime, pointer, decoder.decode(readCString(pointer)));
}
function secretPasswordStoreSync(schema, collection, label, password, cancellable, errorOut, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    prepareLibsecretError(errorOut, runtime);
    const errorStorage = new Uint8Array(8);
    const stored = libsecret.symbols.secret_password_store_sync(schemaPointer(schema), ptr(cstr(collection)), ptr(cstr(label)), ptr(cstr(password)), cancellable === null ? null : cancellablePointer(cancellable), ptr(errorStorage), ptr(cstr(attributeName1)), ptr(cstr(attributeValue1)), ptr(cstr(attributeName2)), ptr(cstr(attributeValue2)), terminator);
    captureError(errorOut, errorStorage);
    return Boolean(stored);
}
function secretPasswordClearSync(schema, cancellable, errorOut, attributeName1, attributeValue1, attributeName2, attributeValue2, terminator) {
    if (terminator !== null)
        throw new TypeError("The libsecret attribute terminator must be null.");
    prepareLibsecretError(errorOut, runtime);
    const errorStorage = new Uint8Array(8);
    const cleared = libsecret.symbols.secret_password_clear_sync(schemaPointer(schema), cancellable === null ? null : cancellablePointer(cancellable), ptr(errorStorage), ptr(cstr(attributeName1)), ptr(cstr(attributeValue1)), ptr(cstr(attributeName2)), ptr(cstr(attributeValue2)), terminator);
    captureError(errorOut, errorStorage);
    return Boolean(cleared);
}
function secretPasswordFree(password) {
    libsecret.symbols.secret_password_free(passwordPointer(password));
}
function cancellableNew() {
    if (gio === undefined)
        throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
    const pointer = gio.symbols.g_cancellable_new();
    if (pointer === null)
        throw new Error("Failed to create GCancellable.");
    return new GCancellableHandle(runtime, pointer);
}
function cancellableCancel(cancellable) {
    if (gio === undefined)
        throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
    gio.symbols.g_cancellable_cancel(cancellablePointer(cancellable));
}
function cancellableRelease(cancellable) {
    if (gio === undefined)
        throw new Error("GIO is unavailable; install libgio-2.0 to use GCancellable operations.");
    const pointer = cancellablePointer(cancellable);
    releaseGCancellable(cancellable, runtime);
    gobject.symbols.g_object_unref(pointer);
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
};
