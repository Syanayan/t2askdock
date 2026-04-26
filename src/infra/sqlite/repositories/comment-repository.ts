import { ERROR_CODES } from '../../../core/errors/error-codes.js';
import type { Comment } from '../../../core/domain/entities/comment.js';
import type {
  CommentRepository as CommentRepositoryPort,
  CommentUpdate
} from '../../../core/ports/repositories/comment-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

export class CommentRepository implements CommentRepositoryPort {
  public constructor(private readonly client: SqliteClient) {}

  public async create(comment: Comment): Promise<void> {
    await this.client.run(
      `INSERT INTO comments(comment_id, task_id, body, created_by, updated_by, created_at, updated_at, version, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        comment.value.commentId,
        comment.value.taskId,
        comment.value.body,
        comment.value.createdBy,
        comment.value.updatedBy,
        comment.value.createdAt,
        comment.value.updatedAt,
        comment.value.version,
        comment.value.deletedAt
      ]
    );
  }

  public async updateWithVersion(comment: CommentUpdate, expectedVersion: number): Promise<void> {
    const result = await this.client.run(
      `UPDATE comments
       SET body = ?, updated_by = ?, updated_at = ?, version = version + 1
       WHERE comment_id = ? AND version = ? AND deleted_at IS NULL`,
      [comment.body, comment.updatedBy, comment.updatedAt, comment.commentId, expectedVersion]
    );

    if (result.changes === 0) {
      throw new Error(ERROR_CODES.COMMENT_CONFLICT);
    }
  }

  public async softDelete(commentId: string, deletedAt: string, deletedBy: string, expectedVersion: number): Promise<void> {
    const result = await this.client.run(
      `UPDATE comments
       SET deleted_at = ?, updated_by = ?, updated_at = ?, version = version + 1
       WHERE comment_id = ? AND version = ? AND deleted_at IS NULL`,
      [deletedAt, deletedBy, deletedAt, commentId, expectedVersion]
    );

    if (result.changes === 0) {
      throw new Error(ERROR_CODES.COMMENT_NOT_FOUND);
    }
  }

  public async findByTask(taskId: string, includeDeleted: boolean): Promise<ReadonlyArray<Comment['value']>> {
    const whereDeleted = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.client.all<Comment['value']>(
      `SELECT comment_id AS commentId,
              task_id AS taskId,
              body,
              created_by AS createdBy,
              updated_by AS updatedBy,
              created_at AS createdAt,
              updated_at AS updatedAt,
              version,
              deleted_at AS deletedAt
       FROM comments
       WHERE task_id = ?
       ${whereDeleted}
       ORDER BY created_at ASC`,
      [taskId]
    );
  }
}
