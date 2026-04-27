export type SessionRecord = {
  token: string;
  keyId: string;
  profileId: string;
  deviceFingerprint: string;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

export type SessionPolicy = {
  ttlMs: number;
  idleTimeoutMs: number;
};

export class SessionLifecycle {
  private readonly sessions = new Map<string, SessionRecord>();

  public constructor(private readonly policy: SessionPolicy) {}

  public create(input: { token: string; keyId: string; profileId: string; deviceFingerprint: string; now: string }): SessionRecord {
    const nowTs = new Date(input.now).getTime();
    const session: SessionRecord = {
      token: input.token,
      keyId: input.keyId,
      profileId: input.profileId,
      deviceFingerprint: input.deviceFingerprint,
      issuedAt: input.now,
      lastSeenAt: input.now,
      expiresAt: new Date(nowTs + this.policy.ttlMs).toISOString(),
      revokedAt: null
    };
    this.sessions.set(session.token, session);
    return session;
  }

  public validate(token: string, now: string): SessionRecord | null {
    const session = this.sessions.get(token);
    if (session === undefined || session.revokedAt !== null) {
      return null;
    }

    const nowTs = new Date(now).getTime();
    if (new Date(session.expiresAt).getTime() <= nowTs) {
      return null;
    }

    if (nowTs - new Date(session.lastSeenAt).getTime() > this.policy.idleTimeoutMs) {
      return null;
    }

    return session;
  }

  public touch(token: string, now: string): boolean {
    const session = this.validate(token, now);
    if (session === null) {
      return false;
    }
    session.lastSeenAt = now;
    return true;
  }

  public revoke(token: string, now: string): void {
    const session = this.sessions.get(token);
    if (session !== undefined) {
      session.revokedAt = now;
    }
  }

  public revokeByKeyId(keyId: string, now: string): number {
    let changed = 0;
    for (const session of this.sessions.values()) {
      if (session.keyId === keyId && session.revokedAt === null) {
        session.revokedAt = now;
        changed += 1;
      }
    }
    return changed;
  }
}
