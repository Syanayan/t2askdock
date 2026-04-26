import { AddTaskCommentUseCase } from '../usecase/comments/add-task-comment-usecase.js';
import { DeleteTaskCommentUseCase } from '../usecase/comments/delete-task-comment-usecase.js';
import { ListTaskCommentsUseCase } from '../usecase/comments/list-task-comments-usecase.js';
import { UpdateTaskCommentUseCase } from '../usecase/comments/update-task-comment-usecase.js';
import { AccessKeyPolicy } from '../domain/services/access-key-policy.js';
import { AuthenticateAccessKeyUseCase, type AccessKeyVerifier } from '../usecase/authenticate-access-key-usecase.js';
import { CreateTaskUseCase } from '../usecase/create-task-usecase.js';
import { GrantProjectEditPermissionUseCase } from '../usecase/grant-project-edit-permission-usecase.js';
import { MoveTaskStatusUseCase } from '../usecase/move-task-status-usecase.js';
import { RunPermissionExpirySweepUseCase } from '../usecase/run-permission-expiry-sweep-usecase.js';
import { SetFeatureFlagUseCase } from '../usecase/set-feature-flag-usecase.js';
import { SwitchDatabaseProfileUseCase } from '../usecase/switch-database-profile-usecase.js';
import { UpdateTaskUseCase } from '../usecase/update-task-usecase.js';
import type { AccessKeyRepository } from '../ports/repositories/access-key-repository.js';
import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { CommentRepository } from '../ports/repositories/comment-repository.js';
import type { DatabaseProfileRepository } from '../ports/repositories/database-profile-repository.js';
import type { FeatureFlagRepository } from '../ports/repositories/feature-flag-repository.js';
import type { ProjectPermissionRepository } from '../ports/repositories/project-permission-repository.js';
import type { TaskRepository } from '../ports/repositories/task-repository.js';
import type { IdGenerator } from '../ports/services/id-generator.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export type Infrastructure = {
  taskRepository: TaskRepository;
  commentRepository: CommentRepository;
  accessKeyRepository: AccessKeyRepository;
  databaseProfileRepository: DatabaseProfileRepository;
  featureFlagRepository: FeatureFlagRepository;
  projectPermissionRepository: ProjectPermissionRepository;
  auditLogRepository: AuditLogRepository;
  transactionManager: TransactionManager;
  idGenerator: IdGenerator;
  accessKeyVerifier: AccessKeyVerifier;
};

export type UseCases = {
  createTaskUseCase: CreateTaskUseCase;
  updateTaskUseCase: UpdateTaskUseCase;
  moveTaskStatusUseCase: MoveTaskStatusUseCase;
  addTaskCommentUseCase: AddTaskCommentUseCase;
  updateTaskCommentUseCase: UpdateTaskCommentUseCase;
  deleteTaskCommentUseCase: DeleteTaskCommentUseCase;
  listTaskCommentsUseCase: ListTaskCommentsUseCase;
  authenticateAccessKeyUseCase: AuthenticateAccessKeyUseCase;
  setFeatureFlagUseCase: SetFeatureFlagUseCase;
  grantProjectEditPermissionUseCase: GrantProjectEditPermissionUseCase;
  runPermissionExpirySweepUseCase: RunPermissionExpirySweepUseCase;
  switchDatabaseProfileUseCase: SwitchDatabaseProfileUseCase;
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
      listTaskCommentsUseCase: new ListTaskCommentsUseCase(this.infrastructure.commentRepository),
      authenticateAccessKeyUseCase: new AuthenticateAccessKeyUseCase(
        this.infrastructure.accessKeyRepository,
        this.infrastructure.databaseProfileRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.accessKeyVerifier,
        new AccessKeyPolicy()
      ),
      setFeatureFlagUseCase: new SetFeatureFlagUseCase(
        this.infrastructure.featureFlagRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      grantProjectEditPermissionUseCase: new GrantProjectEditPermissionUseCase(
        this.infrastructure.projectPermissionRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      runPermissionExpirySweepUseCase: new RunPermissionExpirySweepUseCase(
        this.infrastructure.projectPermissionRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      ),
      switchDatabaseProfileUseCase: new SwitchDatabaseProfileUseCase(this.infrastructure.databaseProfileRepository)
    };
  }
}
