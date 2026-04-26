import { ERROR_CODES } from '../../../core/errors/error-codes.js';
import type { SqliteClient } from '../sqlite-client.js';

export type CommentUpdate = {
  commentId: string;
  body: string;
  updatedBy: string;
  updatedAt: string;
};

export class CommentRepository {
  public constructor(private readonly client: SqliteClient) {}

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
}
