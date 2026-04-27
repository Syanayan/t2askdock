import { ERROR_CODES } from '../../errors/error-codes.js';

export type NetworkFsDiagnostics = {
  lockAcquisitionMs: number;
  heartbeatRttMs: number;
  lockConsistencyOk: boolean;
};

export type NetworkFsSafetyDecision = {
  safe: boolean;
  reason: 'ok' | 'lock_inconsistent' | 'rtt_too_high';
};

export class NetworkFsSafetyGuard {
  public constructor(
    private readonly maxRttMs: number,
    private readonly maxLockAcquisitionMs: number
  ) {}

  public diagnose(input: NetworkFsDiagnostics): NetworkFsSafetyDecision {
    if (!input.lockConsistencyOk || input.lockAcquisitionMs > this.maxLockAcquisitionMs) {
      return { safe: false, reason: 'lock_inconsistent' };
    }
    if (input.heartbeatRttMs > this.maxRttMs) {
      return { safe: false, reason: 'rtt_too_high' };
    }
    return { safe: true, reason: 'ok' };
  }

  public assertSafe(input: NetworkFsDiagnostics): void {
    const decision = this.diagnose(input);
    if (!decision.safe) {
      throw new Error(ERROR_CODES.DB_LOCK_UNSAFE);
    }
  }
}
