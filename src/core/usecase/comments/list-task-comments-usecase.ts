import type { CommentRow, CommentRepository } from '../../ports/repositories/comment-repository.js';

export type ListTaskCommentsInput = {
  taskId: string;
  includeDeleted?: boolean;
};

export class ListTaskCommentsUseCase {
  public constructor(private readonly commentRepository: CommentRepository) {}

  public async execute(input: ListTaskCommentsInput): Promise<ReadonlyArray<CommentRow>> {
    return this.commentRepository.findByTask(input.taskId, input.includeDeleted ?? false);
  }
}
