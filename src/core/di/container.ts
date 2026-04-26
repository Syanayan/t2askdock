import { AddTaskCommentUseCase } from '../usecase/comments/add-task-comment-usecase.js';
import { DeleteTaskCommentUseCase } from '../usecase/comments/delete-task-comment-usecase.js';
import { ListTaskCommentsUseCase } from '../usecase/comments/list-task-comments-usecase.js';
import { UpdateTaskCommentUseCase } from '../usecase/comments/update-task-comment-usecase.js';
import { CreateTaskUseCase } from '../usecase/create-task-usecase.js';
import { MoveTaskStatusUseCase } from '../usecase/move-task-status-usecase.js';
import { UpdateTaskUseCase } from '../usecase/update-task-usecase.js';
import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { CommentRepository } from '../ports/repositories/comment-repository.js';
import type { TaskRepository } from '../ports/repositories/task-repository.js';
import type { IdGenerator } from '../ports/services/id-generator.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export type Infrastructure = {
  taskRepository: TaskRepository;
  commentRepository: CommentRepository;
  auditLogRepository: AuditLogRepository;
  transactionManager: TransactionManager;
  idGenerator: IdGenerator;
};

export type UseCases = {
  createTaskUseCase: CreateTaskUseCase;
  updateTaskUseCase: UpdateTaskUseCase;
  moveTaskStatusUseCase: MoveTaskStatusUseCase;
  addTaskCommentUseCase: AddTaskCommentUseCase;
  updateTaskCommentUseCase: UpdateTaskCommentUseCase;
  deleteTaskCommentUseCase: DeleteTaskCommentUseCase;
  listTaskCommentsUseCase: ListTaskCommentsUseCase;
};

export class AppContainer {
  public constructor(private readonly infrastructure: Infrastructure) {}

  public buildUseCases(): UseCases {
    const updateTaskUseCase = new UpdateTaskUseCase(
      this.infrastructure.taskRepository,
      this.infrastructure.auditLogRepository,
      this.infrastructure.transactionManager,
      this.infrastructure.idGenerator
    );

    return {
      createTaskUseCase: new CreateTaskUseCase(
        this.infrastructure.taskRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      updateTaskUseCase,
      moveTaskStatusUseCase: new MoveTaskStatusUseCase(updateTaskUseCase),
      addTaskCommentUseCase: new AddTaskCommentUseCase(
        this.infrastructure.commentRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      updateTaskCommentUseCase: new UpdateTaskCommentUseCase(
        this.infrastructure.commentRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      deleteTaskCommentUseCase: new DeleteTaskCommentUseCase(
        this.infrastructure.commentRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      listTaskCommentsUseCase: new ListTaskCommentsUseCase(this.infrastructure.commentRepository)
    };
  }
}
