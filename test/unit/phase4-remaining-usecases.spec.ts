import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { SessionLifecycle } from '../../src/core/services/session-lifecycle.js';
import { UpdateConnectorSettingsUseCase } from '../../src/core/usecase/connector/update-connector-settings-usecase.js';
import { RotateConnectorSecretUseCase } from '../../src/core/usecase/connector/rotate-connector-secret-usecase.js';
import { SetReadOnlyModeUseCase } from '../../src/core/usecase/db/set-read-only-mode-usecase.js';
import { SwitchDatabaseProfileUseCase } from '../../src/core/usecase/db/switch-database-profile-usecase.js';
import { SetFeatureFlagUseCase } from '../../src/core/usecase/feature-flags/set-feature-flag-usecase.js';
import { IssueAccessKeyUseCase } from '../../src/core/usecase/key-management/issue-access-key-usecase.js';
import { ReissueAccessKeyUseCase } from '../../src/core/usecase/key-management/reissue-access-key-usecase.js';
import { RevokeAccessKeyUseCase } from '../../src/core/usecase/key-management/revoke-access-key-usecase.js';
import { GrantProjectEditPermissionUseCase } from '../../src/core/usecase/permissions/grant-project-edit-permission-usecase.js';
import { RunPermissionExpirySweepUseCase } from '../../src/core/usecase/permissions/run-permission-expiry-sweep-usecase.js';

describe('phase4 remaining usecases', () => {
  it('Issue/Revoke/Reissue access key flow records audit logs', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const revokeKey = vi.fn().mockResolvedValue(undefined);
    const revokeWrappers = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn((work: () => Promise<unknown>) => work()) as unknown as <T>(work: () => Promise<T>) => Promise<T>;

    const ids = ['k-1', 'log-issue', 'log-revoke', 'log-reissue'];
    const issue = new IssueAccessKeyUseCase(
      { save },
      { upsert },
      { append },
      { runInTx },
      { nextUlid: () => ids.shift() ?? 'id-fallback' },
      { createAccessKey: () => 'plain', hash: async () => ({ keyHash: 'h', keySalt: 's' }) },
      { createActiveWrapper: async () => ({ encryptedDek: new Uint8Array([1]), wrapSalt: 'ws', kekVersion: 1 }) }
    );

    const sessionLifecycle = new SessionLifecycle({ ttlMs: 60_000, idleTimeoutMs: 30_000 });
    sessionLifecycle.create({ token: 't-1', keyId: 'old', profileId: 'p1', deviceFingerprint: 'd', now: '2026-04-26T00:00:00.000Z' });

    const revoke = new RevokeAccessKeyUseCase(
      { revoke: revokeKey },
      { revokeByKeyId: revokeWrappers },
      { append },
      { runInTx },
      { nextUlid: () => ids.shift() ?? 'id-fallback' },
      sessionLifecycle
    );

    const reissue = new ReissueAccessKeyUseCase(
      revoke,
      issue,
      { append },
      { nextUlid: () => ids.shift() ?? 'id-fallback' }
    );

    const issued = await issue.execute({
      ownerType: 'user',
      issuedFor: 'u1',
      profileIds: ['p1'],
      expiresAt: null,
      issuedBy: 'admin',
      now: '2026-04-26T00:00:00.000Z'
    });

    const revoked = await revoke.execute({ keyId: 'old', actorId: 'admin', now: '2026-04-26T00:00:01.000Z' });
    const reissued = await reissue.execute({
      oldKeyId: 'old',
      ownerType: 'user',
      issuedFor: 'u1',
      profileIds: ['p1'],
      expiresAt: null,
      issuedBy: 'admin',
      now: '2026-04-26T00:00:02.000Z'
    });

    expect(issued.keyId).toBe('k-1');
    expect(save).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    expect(revokeKey).toHaveBeenCalledWith('old', '2026-04-26T00:00:01.000Z');
    expect(revokeWrappers).toHaveBeenCalledWith('old', '2026-04-26T00:00:01.000Z');
    expect(revoked.revokedSessions).toBe(1);
    expect(reissued.rawAccessKey).toBe('plain');
    expect(runInTx).toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'KEY_ISSUED' }));
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'KEY_REVOKED' }));
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'KEY_REISSUED' }));
  });

  it('SetFeatureFlag/GrantPermission/ExpirySweep execute repository calls', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    await new SetFeatureFlagUseCase({ upsert }).execute({
      flagKey: 'connector.github.enabled',
      enabled: true,
      scopeType: 'profile',
      scopeId: 'p1',
      updatedBy: 'admin',
      now: '2026-04-26T00:00:00.000Z'
    });

    const revokeActiveGrant = vi.fn().mockResolvedValue(undefined);
    const grant = vi.fn().mockResolvedValue(undefined);
    const grantUseCase = new GrantProjectEditPermissionUseCase({ revokeActiveGrant, grant }, { nextUlid: () => 'g1' });
    const grantOut = await grantUseCase.execute({
      projectId: 'prj',
      userId: 'user',
      canEdit: true,
      expiresAt: null,
      grantedBy: 'admin',
      now: '2026-04-26T00:00:00.000Z'
    });

    const sweepOut = await new RunPermissionExpirySweepUseCase({ expireDuePermissions: vi.fn().mockResolvedValue(2) }).execute({
      now: '2026-04-26T00:00:00.000Z'
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(revokeActiveGrant).toHaveBeenCalledOnce();
    expect(grant).toHaveBeenCalledOnce();
    expect(grantOut.grantId).toBe('g1');
    expect(sweepOut.expiredCount).toBe(2);
  });

  it('SwitchDatabaseProfile and SetReadOnlyMode enforce auth/permission constraints', async () => {
    const switchUseCase = new SwitchDatabaseProfileUseCase(
      { findById: vi.fn().mockResolvedValue({ profileId: 'p1', name: 'Profile 1', mode: 'readWrite', path: '/tmp/db.sqlite' }) },
      { isAuthenticated: vi.fn().mockReturnValue(true) },
      { check: vi.fn().mockResolvedValue('healthy') },
      { check: vi.fn().mockResolvedValue({ exists: true, readable: true, writable: true }), checkDirectory: vi.fn(), listSqliteFiles: vi.fn() }
    );

    const switched = await switchUseCase.execute({ profileId: 'p1' });
    expect(switched.connectionMode).toBe('readWrite');

    const failing = new SwitchDatabaseProfileUseCase(
      { findById: vi.fn().mockResolvedValue({ profileId: 'p1', name: 'Profile 1', mode: 'readWrite', path: '/tmp/db.sqlite' }) },
      { isAuthenticated: vi.fn().mockReturnValue(false) },
      { check: vi.fn().mockResolvedValue('healthy') },
      { check: vi.fn().mockResolvedValue({ exists: true, readable: true, writable: true }), checkDirectory: vi.fn(), listSqliteFiles: vi.fn() }
    );
    await expect(failing.execute({ profileId: 'p1' })).rejects.toThrow(ERROR_CODES.AUTH_FAILED);

    const setMode = vi.fn().mockResolvedValue(undefined);
    await expect(new SetReadOnlyModeUseCase({ setMode }).execute({ profileId: 'p1', enabled: false, actorRole: 'general' })).rejects.toThrow(
      ERROR_CODES.PERMISSION_DENIED
    );
    await expect(new SetReadOnlyModeUseCase({ setMode }).execute({ profileId: 'p1', enabled: true, actorRole: 'general' })).resolves.toEqual({ mode: 'readOnly' });
  });

  it('SessionLifecycle manages ttl/idle/revocation and connector usecases run', async () => {
    const session = new SessionLifecycle({ ttlMs: 60_000, idleTimeoutMs: 10_000 });
    session.create({ token: 't1', keyId: 'k1', profileId: 'p1', deviceFingerprint: 'd1', now: '2026-04-26T00:00:00.000Z' });
    expect(session.validate('t1', '2026-04-26T00:00:05.000Z')).not.toBeNull();
    expect(session.touch('t1', '2026-04-26T00:00:05.000Z')).toBe(true);
    expect(session.validate('t1', '2026-04-26T00:00:20.001Z')).toBeNull();

    const findByConnectorAndProfile = vi.fn().mockResolvedValue({
      connectorId: 'github',
      profileId: 'p1',
      enabled: true,
      authType: 'token',
      settingsJson: '{}',
      secretRef: 'secret:old',
      syncPolicy: 'manual'
    });
    const upsert = vi.fn().mockResolvedValue(undefined);

    const rotateOut = await new RotateConnectorSecretUseCase(
      { findByConnectorAndProfile, upsert },
      { nextSecretRef: () => 'secret:new' }
    ).execute({ connectorId: 'github', profileId: 'p1', updatedBy: 'admin', now: '2026-04-26T00:00:00.000Z' });

    expect(rotateOut.secretRef).toBe('secret:new');

    const updateOut = await new UpdateConnectorSettingsUseCase(
      { isEnabled: vi.fn().mockResolvedValue(false) },
      { upsert }
    ).execute({
      connectorId: 'github',
      profileId: 'p1',
      actorId: 'u1',
      authType: 'token',
      settingsJson: '{}',
      secretRef: 'secret:new',
      syncPolicy: 'manual',
      now: '2026-04-26T00:00:01.000Z'
    });

    expect(updateOut.enabled).toBe(false);

    await expect(
      new RotateConnectorSecretUseCase(
        { findByConnectorAndProfile: vi.fn().mockResolvedValue(null), upsert },
        { nextSecretRef: () => 'secret:new' }
      ).execute({ connectorId: 'github', profileId: 'p1', updatedBy: 'admin', now: '2026-04-26T00:00:00.000Z' })
    ).rejects.toThrow(ERROR_CODES.CONNECTOR_SECRET_MISSING);
  });
});
