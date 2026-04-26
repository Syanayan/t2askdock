import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { CommentRepository } from '../../ports/repositories/comment-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';
import type { TransactionManager } from '../../ports/services/transaction-manager.js';

export type DeleteTaskCommentInput = {
  commentId: string;
  actorId: string;
  now: string;
  expectedVersion: number;
};

export class DeleteTaskCommentUseCase {
  public constructor(
    private readonly commentRepository: CommentRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: DeleteTaskCommentInput): Promise<void> {
    await this.transactionManager.runInTx(async () => {
      await this.commentRepository.softDelete(input.commentId, input.now, input.actorId, input.expectedVersion);

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'TASK_COMMENT_DELETED',
        targetType: 'comment',
        targetId: input.commentId,
        payloadDiffJson: JSON.stringify({ deletedAt: input.now }),
        retentionClass: 'default',
        createdAt: input.now
      });
    });
  }
}
