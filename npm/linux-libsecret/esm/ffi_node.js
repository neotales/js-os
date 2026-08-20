import process from "node:process";
const { createRequire } = process.getBuiltinModule("node:module");
const require = createRequire(import.meta.url ?? "file:///");
const ffi = require("node:ffi");
const libsecret = ffi.dlopen("libsecret-1.so.0", {
    secret_schema_new: {
        arguments: ["pointer", "u32", "pointer", "u32", "pointer", "u32", "pointer"],
        return: "pointer",
    },
    secret_password_lookup_sync: {
        arguments: [
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
        ],
        return: "pointer",
    },
    secret_password_store_sync: {
        arguments: [
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
        ],
        return: "u8",
    },
    secret_password_clear_sync: {
        arguments: [
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
        ],
        return: "u8",
    },
    secret_password_search_sync: {
        arguments: ["pointer", "u32", "pointer", "pointer", "pointer", "pointer", "pointer"],
        return: "pointer",
    },
    secret_retrievable_get_attributes: {
        arguments: ["pointer"],
        return: "pointer",
    },
    secret_retrievable_retrieve_secret_sync: {
        arguments: ["pointer", "pointer", "pointer"],
        return: "pointer",
    },
    secret_value_get: {
        arguments: ["pointer", "pointer"],
        return: "pointer",
    },
    secret_value_unref: {
        arguments: ["pointer"],
        return: "void",
    },
    secret_password_free: {
        arguments: ["pointer"],
        return: "void",
    },
});
const glib = ffi.dlopen("libglib-2.0.so.0", {
    g_error_free: {
        arguments: ["pointer"],
        return: "void",
    },
    g_hash_table_lookup: {
        arguments: ["pointer", "pointer"],
        return: "pointer",
    },
    g_hash_table_unref: {
        arguments: ["pointer"],
        return: "void",
    },
    g_list_free: {
        arguments: ["pointer"],
        return: "void",
    },
});
const gobject = ffi.dlopen("libgobject-2.0.so.0", {
    g_object_unref: {
        arguments: ["pointer"],
        return: "void",
    },
});
const enc = new TextEncoder();
const dec = new TextDecoder();
let schemaPtr = null;
function cstr(value) {
    const b = enc.encode(value);
    const out = new Uint8Array(b.length + 1);
    out.set(b);
    return out;
}
function readCString(ptr) {
    const bytes = [];
    for (let i = 0;; i++) {
        const b = ffi.getUint8(ptr, i);
        if (b === 0)
            break;
        bytes.push(b);
    }
    return new Uint8Array(bytes);
}
function readCStringText(ptr) {
    return dec.decode(readCString(ptr));
}
function listDataPtr(listPtr) {
    return ffi.getUint64(listPtr, 0);
}
function listNextPtr(listPtr) {
    return ffi.getUint64(listPtr, 8);
}
function throwIfError(errorOut) {
    const errPtr = new DataView(errorOut.buffer).getBigUint64(0, true);
    if (!errPtr)
        return;
    const msgPtr = ffi.getUint64(errPtr, 8);
    const msg = msgPtr ? dec.decode(readCString(msgPtr)) : "Unknown libsecret error";
    glib.functions.g_error_free(errPtr);
    throw new Error(msg);
}
function getSchema() {
    if (schemaPtr !== null)
        return schemaPtr;
    const schema = libsecret.functions.secret_schema_new(cstr("org.freedesktop.Secret.Generic"), 0, cstr("service"), 0, cstr("account"), 0, null);
    if (schema === null) {
        throw new Error("Failed to create libsecret schema");
    }
    schemaPtr = schema;
    return schema;
}
export const backend = {
    getSecretBytes(service, account) {
        const errorOut = new Uint8Array(8);
        const p = libsecret.functions.secret_password_lookup_sync(getSchema(), null, errorOut, cstr("service"), cstr(service), cstr("account"), cstr(account), null);
        throwIfError(errorOut);
        if (!p)
            return null;
        try {
            return readCString(p);
        }
        finally {
            libsecret.functions.secret_password_free(p);
        }
    },
    setSecretBytes(service, account, secret) {
        const errorOut = new Uint8Array(8);
        const ok = libsecret.functions.secret_password_store_sync(getSchema(), cstr("default"), cstr(`${service}/${account}`), cstr(dec.decode(secret)), null, errorOut, cstr("service"), cstr(service), cstr("account"), cstr(account), null);
        throwIfError(errorOut);
        if (!ok)
            throw new Error("Failed to store secret");
    },
    deleteSecret(service, account) {
        const errorOut = new Uint8Array(8);
        const ok = libsecret.functions.secret_password_clear_sync(getSchema(), null, errorOut, cstr("service"), cstr(service), cstr("account"), cstr(account), null);
        throwIfError(errorOut);
        return !!ok;
    },
    list(serviceName) {
        const errorOut = new Uint8Array(8);
        const list = libsecret.functions.secret_password_search_sync(getSchema(), 2, null, errorOut, cstr("service"), cstr(serviceName), null);
        throwIfError(errorOut);
        if (!list)
            return [];
        const results = [];
        try {
            for (let node = list; node; node = listNextPtr(node)) {
                const retrievable = listDataPtr(node);
                if (!retrievable)
                    continue;
                const attributes = libsecret.functions.secret_retrievable_get_attributes(retrievable);
                try {
                    const accountPtr = glib.functions.g_hash_table_lookup(attributes, cstr("account"));
                    if (!accountPtr)
                        continue;
                    const secretErrorOut = new Uint8Array(8);
                    const value = libsecret.functions.secret_retrievable_retrieve_secret_sync(retrievable, null, secretErrorOut);
                    throwIfError(secretErrorOut);
                    if (!value)
                        continue;
                    try {
                        const lengthOut = new Uint8Array(8);
                        const secretPtr = libsecret.functions.secret_value_get(value, lengthOut);
                        if (!secretPtr)
                            continue;
                        results.push({
                            service: serviceName,
                            account: readCStringText(accountPtr),
                            secret: readCStringText(secretPtr),
                        });
                    }
                    finally {
                        libsecret.functions.secret_value_unref(value);
                    }
                }
                finally {
                    glib.functions.g_hash_table_unref(attributes);
                }
            }
        }
        finally {
            for (let node = list; node; node = listNextPtr(node)) {
                const retrievable = listDataPtr(node);
                if (retrievable)
                    gobject.functions.g_object_unref(retrievable);
            }
            glib.functions.g_list_free(list);
        }
        return results;
    },
};
