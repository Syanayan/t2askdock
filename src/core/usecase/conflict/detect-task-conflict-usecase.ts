import { ConflictDetector, type ConflictType } from '../../domain/services/conflict-detector.js';

export type DetectTaskConflictInput = {
  localVersion: number;
  remoteVersion: number | null;
};

export type DetectTaskConflictOutput = {
  isConflict: boolean;
  conflictType: ConflictType | null;
};

export class DetectTaskConflictUseCase {
  private readonly detector = new ConflictDetector();

  public execute(input: DetectTaskConflictInput): DetectTaskConflictOutput {
    return this.detector.detect(input.localVersion, input.remoteVersion);
  }
}
