import type { Comment } from '../../domain/entities/comment.js';

export type CommentUpdate = {
  commentId: string;
  body: string;
  updatedBy: string;
  updatedAt: string;
};

export type CommentRow = Comment['value'];

export interface CommentRepository {
  create(comment: Comment): Promise<void>;
  updateWithVersion(comment: CommentUpdate, expectedVersion: number): Promise<void>;
  softDelete(commentId: string, deletedAt: string, deletedBy: string, expectedVersion: number): Promise<void>;
  findByTask(taskId: string, includeDeleted: boolean): Promise<ReadonlyArray<CommentRow>>;
}
