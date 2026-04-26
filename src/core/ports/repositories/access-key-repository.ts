export type AccessKeyRecord = {
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
  save(record: AccessKeyRecord): Promise<void>;
  findByKeyId(keyId: string): Promise<AccessKeyRecord | undefined>;
}
