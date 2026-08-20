/** Secret record returned by libsecret listing operations. */
export interface SecretRecord {
    service: string;
    account: string;
    secret: string;
}
/** Internal backend contract implemented by runtime-specific libsecret backends. */
export interface LinuxKeyringBackend {
    getSecretBytes(service: string, account: string): Uint8Array | null;
    setSecretBytes(service: string, account: string, secret: Uint8Array): void;
    deleteSecret(service: string, account: string): boolean;
    list?: (service: string) => SecretRecord[];
}
