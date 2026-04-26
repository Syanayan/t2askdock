export type AccessKeyAuthRow = {
  keyId: string;
  ownerType: 'user' | 'device';
  issuedFor: string;
  keyHash: string;
  keySalt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  issuedBy: string;
  issuedAt: string;
};

export interface AccessKeyRepository {
  findByKeyId(keyId: string): Promise<AccessKeyAuthRow | null>;
}
