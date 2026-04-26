import { describe, expect, it, vi } from 'vitest';
import { AccessKeyPolicy } from '../../src/core/domain/services/access-key-policy.js';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { AuthenticateAccessKeyUseCase } from '../../src/core/usecase/authenticate-access-key-usecase.js';
import { GrantProjectEditPermissionUseCase } from '../../src/core/usecase/grant-project-edit-permission-usecase.js';
import { RunPermissionExpirySweepUseCase } from '../../src/core/usecase/run-permission-expiry-sweep-usecase.js';
import { SetFeatureFlagUseCase } from '../../src/core/usecase/set-feature-flag-usecase.js';
import { SwitchDatabaseProfileUseCase } from '../../src/core/usecase/switch-database-profile-usecase.js';

describe('phase4 usecases', () => {
  it('authenticates access key when record/profile exist and hash validates', async () => {
    const useCase = new AuthenticateAccessKeyUseCase(
      {
        save: vi.fn(),
        findByKeyId: vi.fn().mockResolvedValue({
          keyId: 'k1',
          ownerType: 'user',
          issuedFor: 'u1',
          keyHash: 'hash',
          keySalt: 'salt',
          expiresAt: null,
          revokedAt: null,
          issuedBy: 'admin',
          issuedAt: '2026-04-26T00:00:00Z'
        })
      },
      {
        save: vi.fn(),
        findById: vi.fn().mockResolvedValue({
          profileId: 'p1',
          name: 'main',
          path: '/tmp/db.sqlite',
          mode: 'readWrite',
          encryptedDek: new Uint8Array([1]),
          dekWrapSalt: 'salt'
        })
      },
      { append: vi.fn() },
      { runInTx: vi.fn(async (work: () => Promise<unknown>) => work()) },
      { verify: vi.fn().mockResolvedValue(true) },
      new AccessKeyPolicy()
    );

    const output = await useCase.execute({
      keyId: 'k1',
      rawAccessKey: 'raw',
      targetProfileId: 'p1',
      deviceFingerprint: 'dev1',
      now: '2026-04-26T00:00:00.000Z'
    });

    expect(output.authenticated).toBe(true);
    expect(output.principalId).toBe('u1');
  });

  it('records AUTH_FAILED and throws when access key is invalid', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const useCase = new AuthenticateAccessKeyUseCase(
      { save: vi.fn(), findByKeyId: vi.fn().mockResolvedValue(undefined) },
      { save: vi.fn(), findById: vi.fn() },
      { append },
      { runInTx },
      { verify: vi.fn() },
      new AccessKeyPolicy()
    );

    await expect(
      useCase.execute({
        keyId: 'missing',
        rawAccessKey: 'raw',
        targetProfileId: 'p1',
        deviceFingerprint: 'dev1',
        now: '2026-04-26T00:00:00.000Z'
      })
    ).rejects.toThrow(ERROR_CODES.AUTH_FAILED);

    expect(runInTx).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'AUTH_FAILED' }));
  });

  it('updates flags/permissions and can switch profile', async () => {
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const upsert = vi.fn().mockResolvedValue(undefined);
    const grant = vi.fn().mockResolvedValue(undefined);
    const expireDuePermissions = vi.fn().mockResolvedValue(2);
    const append = vi.fn().mockResolvedValue(undefined);

    await new SetFeatureFlagUseCase(
      { upsert },
      { append },
      { runInTx },
      { nextUlid: vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FAY') }
    ).execute({
      flagKey: 'github.sync',
      enabled: true,
      scopeType: 'global',
      scopeId: null,
      actorId: 'admin',
      now: '2026-04-26T00:00:00.000Z'
    });

    await new GrantProjectEditPermissionUseCase(
      { grant, revoke: vi.fn(), expireDuePermissions: vi.fn() },
      { append },
      { runInTx },
      { nextUlid: vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FAZ') }
    ).execute({
      grantId: 'g1',
      projectId: 'p1',
      userId: 'u1',
      canEdit: true,
      actorId: 'admin',
      now: '2026-04-26T00:00:00.000Z',
      expiresAt: null
    });

    const expired = await new RunPermissionExpirySweepUseCase(
      { grant: vi.fn(), revoke: vi.fn(), expireDuePermissions },
      { append },
      { runInTx },
      { nextUlid: vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FB0') }
    ).execute('admin', '2026-04-26T00:00:00.000Z');

    const switched = await new SwitchDatabaseProfileUseCase({
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        profileId: 'p1',
        name: 'main',
        path: '/tmp/db.sqlite',
        mode: 'readOnly',
        encryptedDek: new Uint8Array([1]),
        dekWrapSalt: 'salt'
      })
    }).execute('p1');

    expect(upsert).toHaveBeenCalledOnce();
    expect(grant).toHaveBeenCalledOnce();
    expect(expired).toBe(2);
    expect(switched.connectionMode).toBe('READ_ONLY');
  });
});
