import { ERROR_CODES } from '../../errors/error-codes.js';

export class MoveTaskBetweenProfilesUseCase {
  public constructor(
    private readonly databaseProfileRepository: { findById(id: string): Promise<{ profileId: string; mode: 'readWrite' | 'readOnly' } | null> },
    private readonly crossProfileTaskOperator: {
      exportTaskGraph(input: { taskId: string; sourceProfileId: string }): Promise<unknown>;
      importTaskGraph(input: { targetProfileId: string; graph: unknown; now: string }): Promise<void>;
      softDeleteInSource(input: { taskId: string; sourceProfileId: string; now: string }): Promise<void>;
    },
    private readonly auditLogRepository: { append(input: { logId: string; actorId: string; actionType: string; targetType: string; targetId: string; payloadDiffJson: string; retentionClass: string; createdAt: string }): Promise<void> },
    private readonly idGenerator: { nextUlid(): string }
  ) {}

  public async execute(input: { taskId: string; sourceProfileId: string; targetProfileId: string; expectedVersion: number; copyMode: boolean; actorRole: 'admin' | 'general'; actorId: string; now: string }) {
    const source = await this.databaseProfileRepository.findById(input.sourceProfileId);
    const target = await this.databaseProfileRepository.findById(input.targetProfileId);
    if (!source || !target) throw new Error(ERROR_CODES.FILE_NOT_FOUND);
    if (source.mode === 'readOnly' || target.mode === 'readOnly') throw new Error(ERROR_CODES.READ_ONLY_MODE);
    if (input.actorRole !== 'admin') throw new Error(ERROR_CODES.FORBIDDEN);

    const graph = await this.crossProfileTaskOperator.exportTaskGraph({ taskId: input.taskId, sourceProfileId: input.sourceProfileId });
    await this.crossProfileTaskOperator.importTaskGraph({ targetProfileId: input.targetProfileId, graph, now: input.now });
    if (!input.copyMode) {
      await this.crossProfileTaskOperator.softDeleteInSource({ taskId: input.taskId, sourceProfileId: input.sourceProfileId, now: input.now });
    }

    await this.auditLogRepository.append({
      logId: this.idGenerator.nextUlid(),
      actorId: input.actorId,
      actionType: 'TASK_MOVED_ACROSS_DB',
      targetType: 'task',
      targetId: input.taskId,
      payloadDiffJson: JSON.stringify({ sourceProfileId: input.sourceProfileId, targetProfileId: input.targetProfileId, copyMode: input.copyMode }),
      retentionClass: 'default',
      createdAt: input.now
    });

    return { taskMigrationSummary: { taskId: input.taskId, sourceProfileId: input.sourceProfileId, targetProfileId: input.targetProfileId, copied: input.copyMode } };
  }
}
