import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const koffi = require("koffi");
const CREDENTIAL_ATTRIBUTEW = koffi.opaque("CREDENTIAL_ATTRIBUTEW");
const CREDENTIALW = koffi.struct("CREDENTIALW", {
    Flags: "uint32",
    Type: "uint32",
    TargetName: "char16_t *",
    Comment: "char16_t *",
    LastWrittenLow: "uint32",
    LastWrittenHigh: "uint32",
    CredentialBlobSize: "uint32",
    CredentialBlob: "uint8 *",
    Persist: "uint32",
    AttributeCount: "uint32",
    Attributes: koffi.pointer(CREDENTIAL_ATTRIBUTEW),
    TargetAlias: "char16_t *",
    UserName: "char16_t *",
});
const PCREDENTIALW = koffi.pointer("PCREDENTIALW", CREDENTIALW);
const lib = koffi.load("advapi32.dll");
const CredWriteW = lib.func("int __stdcall CredWriteW(CREDENTIALW *Credential, uint32 Flags)");
const CredReadW = lib.func("int __stdcall CredReadW(const char16_t *TargetName, uint32 Type, uint32 Flags, _Out_ PCREDENTIALW *Credential)");
const CredDeleteW = lib.func("int __stdcall CredDeleteW(const char16_t *TargetName, uint32 Type, uint32 Flags)");
const CredEnumerateW = lib.func("int __stdcall CredEnumerateW(const char16_t *Filter, uint32 Flags, _Out_ uint32 *Count, _Out_ PCREDENTIALW **Credentials)");
const CredFree = lib.func("void __stdcall CredFree(void *Buffer)");
const k32 = koffi.load("kernel32.dll");
const GetLastError = k32.func("uint32 __stdcall GetLastError()");
function toRawCredential(c) {
    const blobSize = c.CredentialBlobSize ?? 0;
    const credentialBlob = blobSize > 0 && c.CredentialBlob
        ? koffi.decode(c.CredentialBlob, koffi.array("uint8", blobSize))
        : new Uint8Array(0);
    const lastWritten = (BigInt(c.LastWrittenHigh >>> 0) << 32n) | BigInt(c.LastWrittenLow >>> 0);
    return {
        flags: c.Flags ?? 0,
        type: c.Type ?? 0,
        targetName: c.TargetName ?? "",
        comment: c.Comment ?? "",
        lastWritten,
        credentialBlobSize: blobSize,
        credentialBlob,
        persist: c.Persist ?? 0,
        attributeCount: c.AttributeCount ?? 0,
        targetAlias: c.TargetAlias ?? "",
        userName: c.UserName ?? "",
    };
}
function toKoffiCredential(cred) {
    const low = Number(cred.lastWritten & 0xffffffffn);
    const high = Number((cred.lastWritten >> 32n) & 0xffffffffn);
    return {
        Flags: cred.flags,
        Type: cred.type,
        TargetName: cred.targetName,
        Comment: cred.comment || null,
        LastWrittenLow: low,
        LastWrittenHigh: high,
        CredentialBlobSize: cred.credentialBlob.length,
        CredentialBlob: cred.credentialBlob.length > 0 ? cred.credentialBlob : null,
        Persist: cred.persist,
        AttributeCount: 0,
        Attributes: null,
        TargetAlias: cred.targetAlias || null,
        UserName: cred.userName || null,
    };
}
export const backend = {
    write(cred, flags) {
        const ok = CredWriteW(toKoffiCredential(cred), flags);
        if (!ok)
            throw new Error(`CredWriteW failed with error code ${GetLastError()}`);
    },
    read(targetName, type) {
        const outArr = [null];
        const ok = CredReadW(targetName, type, 0, outArr);
        if (!ok)
            return null;
        try {
            return toRawCredential(koffi.decode(outArr[0], CREDENTIALW));
        }
        finally {
            if (outArr[0])
                CredFree(outArr[0]);
        }
    },
    delete(targetName, type) {
        return !!CredDeleteW(targetName, type, 0);
    },
    enumerate(filter, flags) {
        const countArr = [0];
        const credsArr = [null];
        const ok = CredEnumerateW(filter, flags, countArr, credsArr);
        if (!ok)
            return [];
        const count = countArr[0];
        const results = [];
        try {
            const ptrArray = koffi.decode(credsArr[0], koffi.array(PCREDENTIALW, count));
            for (let i = 0; i < count; i++)
                results.push(toRawCredential(koffi.decode(ptrArray[i], CREDENTIALW)));
        }
        finally {
            if (credsArr[0])
                CredFree(credsArr[0]);
        }
        return results;
    },
};
