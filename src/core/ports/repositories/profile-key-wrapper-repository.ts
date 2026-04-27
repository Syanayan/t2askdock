export type ActiveProfileKeyWrapperRow = {
  profileId: string;
  keyId: string;
  encryptedDek: Uint8Array;
  wrapSalt: string;
  kekVersion: number;
  wrapperStatus: 'active' | 'revoked' | 'rotating';
  createdAt: string;
  revokedAt: string | null;
};

export interface ProfileKeyWrapperRepository {
  findActiveByProfileAndKeyId(profileId: string, keyId: string): Promise<ActiveProfileKeyWrapperRow | null>;
}
