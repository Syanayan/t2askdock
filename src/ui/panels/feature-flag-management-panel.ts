import type { SetFeatureFlagUseCase } from '../../core/usecase/feature-flags/set-feature-flag-usecase.js';

export class FeatureFlagManagementPanel {
  public constructor(private readonly setFeatureFlagUseCase: SetFeatureFlagUseCase) {}

  public async update(input: {
    flagKey: string;
    enabled: boolean;
    scopeType: 'global' | 'profile' | 'user';
    scopeId: string | null;
    updatedBy: string;
    now: string;
  }): Promise<void> {
    await this.setFeatureFlagUseCase.execute(input);
  }

  public getScopeLabel(input: { scopeType: 'global' | 'profile' | 'user'; scopeId: string | null }): string {
    if (input.scopeType === 'global') {
      return 'global';
    }

    return `${input.scopeType}:${input.scopeId ?? 'unknown'}`;
  }
}
