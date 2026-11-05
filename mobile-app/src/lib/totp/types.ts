/** Cuenta TOTP guardada en SecureStore. */
export interface TotpAccount {
  readonly secret: string; // Base32 normalizado
  readonly issuer: string;
  readonly accountName: string;
}
