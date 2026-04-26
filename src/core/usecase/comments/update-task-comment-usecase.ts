import { Comment } from '../../domain/entities/comment.js';
import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { CommentRepository } from '../../ports/repositories/comment-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';
import type { TransactionManager } from '../../ports/services/transaction-manager.js';

export type UpdateTaskCommentInput = {
  commentId: string;
  taskId: string;
  body: string;
  actorId: string;
  now: string;
  expectedVersion: number;
};

export class UpdateTaskCommentUseCase {
  public constructor(
    private readonly commentRepository: CommentRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: UpdateTaskCommentInput): Promise<void> {
    const comment = Comment.from({
      commentId: input.commentId,
      taskId: input.taskId,
      body: input.body,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: input.now,
      updatedAt: input.now,
      version: input.expectedVersion,
      deletedAt: null
    });

    await this.transactionManager.runInTx(async () => {
      await this.commentRepository.updateWithVersion(
        {
          commentId: comment.value.commentId,
          body: comment.value.body,
          updatedBy: input.actorId,
          updatedAt: input.now
        },
        input.expectedVersion
      );

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'TASK_COMMENT_UPDATED',
        targetType: 'comment',
        targetId: comment.value.commentId,
        payloadDiffJson: JSON.stringify({ body: comment.value.body }),
        retentionClass: 'default',
        createdAt: input.now
      });
    });
  }
}
