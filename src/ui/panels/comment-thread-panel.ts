import type { AddTaskCommentUseCase } from '../../core/usecase/comments/add-task-comment-usecase.js';
import type { DeleteTaskCommentUseCase } from '../../core/usecase/comments/delete-task-comment-usecase.js';
import type { ListTaskCommentsUseCase } from '../../core/usecase/comments/list-task-comments-usecase.js';
import type { UpdateTaskCommentUseCase } from '../../core/usecase/comments/update-task-comment-usecase.js';

export class CommentThreadPanel {
  public constructor(
    private readonly listTaskCommentsUseCase: ListTaskCommentsUseCase,
    private readonly addTaskCommentUseCase: AddTaskCommentUseCase,
    private readonly updateTaskCommentUseCase: UpdateTaskCommentUseCase,
    private readonly deleteTaskCommentUseCase: DeleteTaskCommentUseCase
  ) {}

  public async list(taskId: string): Promise<ReturnType<ListTaskCommentsUseCase['execute']>> {
    return this.listTaskCommentsUseCase.execute({ taskId, includeDeleted: false });
  }

  public async add(input: Parameters<AddTaskCommentUseCase['execute']>[0]): Promise<Awaited<ReturnType<AddTaskCommentUseCase['execute']>>> {
    return this.addTaskCommentUseCase.execute(input);
  }

  public async update(
    input: Parameters<UpdateTaskCommentUseCase['execute']>[0]
  ): Promise<Awaited<ReturnType<UpdateTaskCommentUseCase['execute']>>> {
    return this.updateTaskCommentUseCase.execute(input);
  }

  public async softDelete(
    input: Parameters<DeleteTaskCommentUseCase['execute']>[0]
  ): Promise<Awaited<ReturnType<DeleteTaskCommentUseCase['execute']>>> {
    return this.deleteTaskCommentUseCase.execute(input);
  }
}
