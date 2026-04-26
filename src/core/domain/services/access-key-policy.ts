export type AccessKeyRecord = {
  revokedAt: string | null;
  expiresAt: string | null;
};

export type AccessKeyValidation = {
  valid: boolean;
  reason: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
};

export class AccessKeyPolicy {
  public validate(record: AccessKeyRecord, now: Date): AccessKeyValidation {
    if (record.revokedAt !== null) {
      return { valid: false, reason: 'REVOKED' };
    }

    if (record.expiresAt !== null) {
      const expiresAt = new Date(record.expiresAt);
      if (expiresAt.getTime() <= now.getTime()) {
        return { valid: false, reason: 'EXPIRED' };
      }
    }

    return { valid: true, reason: 'ACTIVE' };
  }
}
