// deno-lint-ignore no-explicit-any
const deno = globalThis.Deno;
const libsecret = deno.dlopen("libsecret-1.so.0", {
    secret_schema_new: {
        parameters: ["buffer", "u32", "buffer", "u32", "buffer", "u32", "pointer"],
        result: "pointer",
    },
    secret_password_lookup_sync: {
        parameters: [
            "pointer",
            "pointer",
            "buffer",
            "buffer",
            "buffer",
            "buffer",
            "buffer",
            "pointer",
        ],
        result: "pointer",
    },
    secret_password_store_sync: {
        parameters: [
            "pointer",
            "buffer",
            "buffer",
            "buffer",
            "pointer",
            "buffer",
            "buffer",
            "buffer",
            "buffer",
            "buffer",
            "pointer",
        ],
        result: "i32",
    },
    secret_password_clear_sync: {
        parameters: [
            "pointer",
            "pointer",
            "buffer",
            "buffer",
            "buffer",
            "buffer",
            "buffer",
            "pointer",
        ],
        result: "i32",
    },
    secret_password_search_sync: {
        parameters: ["pointer", "u32", "pointer", "buffer", "buffer", "buffer", "pointer"],
        result: "pointer",
    },
    secret_password_free: {
        parameters: ["pointer"],
        result: "void",
    },
});
const glib = deno.dlopen("libglib-2.0.so.0", {
    g_error_free: {
        parameters: ["pointer"],
        result: "void",
    },
    g_hash_table_lookup: {
        parameters: ["pointer", "buffer"],
        result: "pointer",
    },
    g_hash_table_unref: {
        parameters: ["pointer"],
        result: "void",
    },
    g_list_free: {
        parameters: ["pointer"],
        result: "void",
    },
});
const gobject = deno.dlopen("libgobject-2.0.so.0", {
    g_object_unref: {
        parameters: ["pointer"],
        result: "void",
    },
});
const libsecretApi = deno.dlopen("libsecret-1.so.0", {
    secret_retrievable_get_attributes: {
        parameters: ["pointer"],
        result: "pointer",
    },
    secret_retrievable_retrieve_secret_sync: {
        parameters: ["pointer", "pointer", "buffer"],
        result: "pointer",
    },
    secret_value_get: {
        parameters: ["pointer", "buffer"],
        result: "pointer",
    },
    secret_value_unref: {
        parameters: ["pointer"],
        result: "void",
    },
});
const enc = new TextEncoder();
const dec = new TextDecoder();
const nullPtr = null;
let schemaPtr = null;
function cstr(value) {
    const b = enc.encode(value);
    const out = new Uint8Array(b.length + 1);
    out.set(b);
    return out;
}
function readPtr(buf) {
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getBigUint64(0, true);
}
function readCString(ptr) {
    return new deno.UnsafePointerView(deno.UnsafePointer.create(ptr)).getCString();
}
function listDataPtr(listPtr) {
    const view = new deno.UnsafePointerView(deno.UnsafePointer.create(listPtr));
    return readU64(view, 0);
}
function listNextPtr(listPtr) {
    const view = new deno.UnsafePointerView(deno.UnsafePointer.create(listPtr));
    return readU64(view, 8);
}
function readU64(view, offset) {
    const lo = view.getUint8(offset) |
        (view.getUint8(offset + 1) << 8) |
        (view.getUint8(offset + 2) << 16) |
        (view.getUint8(offset + 3) << 24);
    const hi = view.getUint8(offset + 4) |
        (view.getUint8(offset + 5) << 8) |
        (view.getUint8(offset + 6) << 16) |
        (view.getUint8(offset + 7) << 24);
    return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
}
function readErrorMessage(errorPtr) {
    const view = new deno.UnsafePointerView(deno.UnsafePointer.create(errorPtr));
    const lo = view.getUint8(8) |
        (view.getUint8(9) << 8) |
        (view.getUint8(10) << 16) |
        (view.getUint8(11) << 24);
    const hi = view.getUint8(12) |
        (view.getUint8(13) << 8) |
        (view.getUint8(14) << 16) |
        (view.getUint8(15) << 24);
    const msgPtr = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
    if (msgPtr === 0n)
        return "Unknown libsecret error";
    const msg = new deno.UnsafePointerView(deno.UnsafePointer.create(msgPtr)).getCString();
    return msg || "Unknown libsecret error";
}
function throwIfError(errorOut) {
    const errorPtr = readPtr(errorOut);
    if (errorPtr === 0n)
        return;
    const message = readErrorMessage(errorPtr);
    glib.symbols.g_error_free(deno.UnsafePointer.create(errorPtr));
    throw new Error(message);
}
function getSchema() {
    if (schemaPtr !== null)
        return schemaPtr;
    const schema = libsecret.symbols.secret_schema_new(cstr("org.freedesktop.Secret.Generic"), 0, cstr("service"), 0, cstr("account"), 0, nullPtr);
    schemaPtr = BigInt(deno.UnsafePointer.value(schema));
    return schemaPtr;
}
export const backend = {
    getSecretBytes(service, account) {
        const errorOut = new Uint8Array(8);
        const ptr = libsecret.symbols.secret_password_lookup_sync(deno.UnsafePointer.create(getSchema()), nullPtr, errorOut, cstr("service"), cstr(service), cstr("account"), cstr(account), nullPtr);
        throwIfError(errorOut);
        const valuePtr = BigInt(deno.UnsafePointer.value(ptr));
        if (valuePtr === 0n)
            return null;
        try {
            const text = new deno.UnsafePointerView(deno.UnsafePointer.create(valuePtr)).getCString();
            return enc.encode(text);
        }
        finally {
            libsecret.symbols.secret_password_free(deno.UnsafePointer.create(valuePtr));
        }
    },
    setSecretBytes(service, account, secret) {
        const errorOut = new Uint8Array(8);
        const label = `${service}/${account}`;
        const ok = libsecret.symbols.secret_password_store_sync(deno.UnsafePointer.create(getSchema()), cstr("default"), cstr(label), cstr(dec.decode(secret)), nullPtr, errorOut, cstr("service"), cstr(service), cstr("account"), cstr(account), nullPtr);
        throwIfError(errorOut);
        if (!ok)
            throw new Error("Failed to store secret");
    },
    deleteSecret(service, account) {
        const errorOut = new Uint8Array(8);
        const ok = libsecret.symbols.secret_password_clear_sync(deno.UnsafePointer.create(getSchema()), nullPtr, errorOut, cstr("service"), cstr(service), cstr("account"), cstr(account), nullPtr);
        throwIfError(errorOut);
        return !!ok;
    },
    list(serviceName) {
        const errorOut = new Uint8Array(8);
        const list = libsecret.symbols.secret_password_search_sync(deno.UnsafePointer.create(getSchema()), 2, nullPtr, errorOut, cstr("service"), cstr(serviceName), nullPtr);
        throwIfError(errorOut);
        const listPtr = BigInt(deno.UnsafePointer.value(list));
        if (listPtr === 0n)
            return [];
        const results = [];
        try {
            for (let node = listPtr; node !== 0n; node = listNextPtr(node)) {
                const retrievable = listDataPtr(node);
                if (retrievable === 0n)
                    continue;
                const attributes = libsecretApi.symbols.secret_retrievable_get_attributes(deno.UnsafePointer.create(retrievable));
                try {
                    const accountPtr = glib.symbols.g_hash_table_lookup(attributes, cstr("account"));
                    const accountAddr = BigInt(deno.UnsafePointer.value(accountPtr));
                    if (accountAddr === 0n)
                        continue;
                    const secretErrorOut = new Uint8Array(8);
                    const value = libsecretApi.symbols.secret_retrievable_retrieve_secret_sync(deno.UnsafePointer.create(retrievable), nullPtr, secretErrorOut);
                    throwIfError(secretErrorOut);
                    const valuePtr = BigInt(deno.UnsafePointer.value(value));
                    if (valuePtr === 0n)
                        continue;
                    try {
                        const lengthOut = new Uint8Array(8);
                        const secretPtr = libsecretApi.symbols.secret_value_get(deno.UnsafePointer.create(valuePtr), lengthOut);
                        const secretAddr = BigInt(deno.UnsafePointer.value(secretPtr));
                        if (secretAddr === 0n)
                            continue;
                        results.push({
                            service: serviceName,
                            account: readCString(accountAddr),
                            secret: readCString(secretAddr),
                        });
                    }
                    finally {
                        libsecretApi.symbols.secret_value_unref(deno.UnsafePointer.create(valuePtr));
                    }
                }
                finally {
                    glib.symbols.g_hash_table_unref(attributes);
                }
            }
        }
        finally {
            for (let node = listPtr; node !== 0n; node = listNextPtr(node)) {
                const retrievable = listDataPtr(node);
                if (retrievable !== 0n) {
                    gobject.symbols.g_object_unref(deno.UnsafePointer.create(retrievable));
                }
            }
            glib.symbols.g_list_free(deno.UnsafePointer.create(listPtr));
        }
        return results;
    },
};
