import { Comment } from '../../domain/entities/comment.js';
import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { CommentRepository } from '../../ports/repositories/comment-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';
import type { TransactionManager } from '../../ports/services/transaction-manager.js';

export type AddTaskCommentInput = {
  commentId: string;
  taskId: string;
  body: string;
  actorId: string;
  now: string;
};

export type AddTaskCommentOutput = {
  commentId: string;
  body: string;
};

export class AddTaskCommentUseCase {
  public constructor(
    private readonly commentRepository: CommentRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: AddTaskCommentInput): Promise<AddTaskCommentOutput> {
    const comment = Comment.from({
      commentId: input.commentId,
      taskId: input.taskId,
      body: input.body,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: input.now,
      updatedAt: input.now,
      version: 1,
      deletedAt: null
    });

    await this.transactionManager.runInTx(async () => {
      await this.commentRepository.create(comment);
      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'TASK_COMMENT_ADDED',
        targetType: 'comment',
        targetId: comment.value.commentId,
        payloadDiffJson: JSON.stringify(comment.value),
        retentionClass: 'default',
        createdAt: input.now
      });
    });

    return { commentId: comment.value.commentId, body: comment.value.body };
  }
}
