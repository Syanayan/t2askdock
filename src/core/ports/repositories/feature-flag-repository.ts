export type FeatureFlagRecord = {
  flagKey: string;
  enabled: boolean;
  scopeType: 'global' | 'profile' | 'user';
  scopeId: string | null;
  updatedBy: string;
  updatedAt: string;
};

export interface FeatureFlagRepository {
  upsert(record: FeatureFlagRecord): Promise<void>;
}
