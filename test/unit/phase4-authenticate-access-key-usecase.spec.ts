import { describe, expect, it, vi } from 'vitest';
import { AccessKeyPolicy } from '../../src/core/domain/services/access-key-policy.js';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { AuthenticateAccessKeyUseCase } from '../../src/core/usecase/auth/authenticate-access-key-usecase.js';

const NOW = '2026-04-26T00:00:00.000Z';

describe('AuthenticateAccessKeyUseCase (phase4)', () => {
  it('authenticates key and returns session token + decrypted DEK', async () => {
    const findByKeyId = vi.fn().mockResolvedValue({
      keyId: 'key-1',
      keyHash: 'hash-1',
      keySalt: 'salt-1',
      expiresAt: null,
      revokedAt: null
    });
    const findActiveByProfileAndKeyId = vi.fn().mockResolvedValue({
      profileId: 'profile-1',
      keyId: 'key-1',
      encryptedDek: new Uint8Array([9, 8, 7]),
      wrapSalt: 'wrap-salt-1',
      kekVersion: 1
    });
    const verify = vi.fn().mockResolvedValue(true);
    const deriveKek = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const decrypt = vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6]));
    const issue = vi.fn().mockReturnValue('session-token-1');

    const useCase = new AuthenticateAccessKeyUseCase(
      { findByKeyId },
      { findActiveByProfileAndKeyId },
      { verify },
      { deriveKek },
      { decrypt },
      { issue },
      new AccessKeyPolicy()
    );

    const output = await useCase.execute({
      keyId: 'key-1',
      rawAccessKey: 'plain-key',
      targetProfileId: 'profile-1',
      deviceFingerprint: 'device-1',
      now: NOW
    });

    expect(verify).toHaveBeenCalledWith('plain-key', 'hash-1', 'salt-1');
    expect(deriveKek).toHaveBeenCalledWith('plain-key', 'salt-1');
    expect(decrypt).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]), new Uint8Array([1, 2, 3]), 'wrap-salt-1');
    expect(issue).toHaveBeenCalledWith({ keyId: 'key-1', profileId: 'profile-1', deviceFingerprint: 'device-1', issuedAt: NOW });
    expect(output).toEqual({
      profileId: 'profile-1',
      keyId: 'key-1',
      sessionToken: 'session-token-1',
      decryptedDek: new Uint8Array([4, 5, 6])
    });
  });

  it('throws E_AUTH_FAILED when key hash verification fails', async () => {
    const useCase = new AuthenticateAccessKeyUseCase(
      {
        findByKeyId: vi.fn().mockResolvedValue({
          keyId: 'key-1',
          keyHash: 'hash-1',
          keySalt: 'salt-1',
          expiresAt: null,
          revokedAt: null
        })
      },
      { findActiveByProfileAndKeyId: vi.fn() },
      { verify: vi.fn().mockResolvedValue(false) },
      { deriveKek: vi.fn() },
      { decrypt: vi.fn() },
      { issue: vi.fn() },
      new AccessKeyPolicy()
    );

    await expect(
      useCase.execute({
        keyId: 'key-1',
        rawAccessKey: 'invalid',
        targetProfileId: 'profile-1',
        deviceFingerprint: 'device-1',
        now: NOW
      })
    ).rejects.toThrow(ERROR_CODES.AUTH_FAILED);
  });

  it('throws E_KEY_EXPIRED when key is expired', async () => {
    const useCase = new AuthenticateAccessKeyUseCase(
      {
        findByKeyId: vi.fn().mockResolvedValue({
          keyId: 'key-1',
          keyHash: 'hash-1',
          keySalt: 'salt-1',
          expiresAt: '2026-04-25T23:59:59.000Z',
          revokedAt: null
        })
      },
      { findActiveByProfileAndKeyId: vi.fn() },
      { verify: vi.fn() },
      { deriveKek: vi.fn() },
      { decrypt: vi.fn() },
      { issue: vi.fn() },
      new AccessKeyPolicy()
    );

    await expect(
      useCase.execute({
        keyId: 'key-1',
        rawAccessKey: 'plain-key',
        targetProfileId: 'profile-1',
        deviceFingerprint: 'device-1',
        now: NOW
      })
    ).rejects.toThrow(ERROR_CODES.KEY_EXPIRED);
  });
});
