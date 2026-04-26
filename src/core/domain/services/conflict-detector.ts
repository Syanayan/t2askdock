export type ConflictType = 'VersionMismatch' | 'Deleted';

export type ConflictResult = {
  isConflict: boolean;
  conflictType: ConflictType | null;
};

export class ConflictDetector {
  public detect(expectedVersion: number, persistedVersion: number | null): ConflictResult {
    if (persistedVersion === null) {
      return { isConflict: true, conflictType: 'Deleted' };
    }

    if (expectedVersion !== persistedVersion) {
      return { isConflict: true, conflictType: 'VersionMismatch' };
    }

    return { isConflict: false, conflictType: null };
  }
}
