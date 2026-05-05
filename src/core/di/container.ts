import type { Priority, TaskStatus } from '../domain/entities/task.js';
import { AddTaskCommentUseCase } from '../usecase/comments/add-task-comment-usecase.js';
import { DeleteTaskCommentUseCase } from '../usecase/comments/delete-task-comment-usecase.js';
import { ListTaskCommentsUseCase } from '../usecase/comments/list-task-comments-usecase.js';
import { UpdateTaskCommentUseCase } from '../usecase/comments/update-task-comment-usecase.js';
import { CreateBackupSnapshotUseCase } from '../usecase/backup/create-backup-snapshot-usecase.js';
import { RestoreBackupSnapshotUseCase } from '../usecase/backup/restore-backup-snapshot-usecase.js';
import { CreateTaskUseCase } from '../usecase/create-task-usecase.js';
import { SetReadOnlyModeUseCase } from '../usecase/db/set-read-only-mode-usecase.js';
import { SwitchDatabaseProfileUseCase } from '../usecase/db/switch-database-profile-usecase.js';
import { MountDatabaseUseCase } from '../usecase/db/mount-database-usecase.js';
import { UnmountDatabaseUseCase } from '../usecase/db/unmount-database-usecase.js';
import { RegisterDatabaseDirectoryUseCase } from '../usecase/db/register-database-directory-usecase.js';
import { ScanDatabaseDirectoryUseCase } from '../usecase/db/scan-database-directory-usecase.js';
import { MoveTaskBetweenProfilesUseCase } from '../usecase/db/move-task-between-profiles-usecase.js';
import { SetFeatureFlagUseCase } from '../usecase/feature-flags/set-feature-flag-usecase.js';
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
  databaseProfileRepository: {
    findById(profileId: string): Promise<{ profileId: string; name: string; mode: 'readWrite' | 'readOnly'; path: string } | null>;
    findAll(): Promise<Array<{ path: string; mountSource: 'individual' | 'directory'; accessAllowed: boolean }>>;
    save(input: unknown): Promise<void>;
    delete(profileId: string): Promise<void>;
    setMode(profileId: string, mode: 'readWrite' | 'readOnly'): Promise<void>;
  };
  authStateReader: { isAuthenticated(profileId: string): boolean };
  connectionHealthChecker: { check(profileId: string): Promise<'healthy' | 'degraded' | 'unreachable'> };
  osFileAccessChecker: import('../ports/services/os-file-access-checker.js').OsFileAccessChecker;
  secretStorageService: import('../ports/services/secret-storage-service.js').SecretStorageService;
  uiEventBus: import('../../ui/events/ui-event-bus.js').UiEventBus;
  featureFlagRepository: {
    upsert(input: {
      flagKey: string;
      enabled: boolean;
      scopeType: 'global' | 'profile' | 'user';
      scopeId: string | null;
      updatedBy: string;
      updatedAt: string;
    }): Promise<void>;
  };
  backupSnapshotFactory: {
    createSnapshot(input: { profileId: string; trigger: 'manual' | 'scheduled_daily' | 'pre_critical_operation'; now: string }): Promise<{
      storagePath: string;
      checksum: string;
      sizeBytes: number;
    }>;
  };
  backupSnapshotRepository: {
    create(input: {
      profileId: string;
      storagePath: string;
      checksum: string;
      sizeBytes: number;
      createdBy: string;
      createdAt: string;
    }): Promise<{ snapshotId: string }>;
    rotate(profileId: string, now: string): Promise<{ removedSnapshotIds: ReadonlyArray<string> }>;
    findById(snapshotId: string): Promise<{ snapshotId: string; profileId: string; checksum: string; storagePath: string } | null>;
  };
  snapshotIntegrityVerifier: {
    verify(input: { snapshotId: string; checksum: string; storagePath: string }): Promise<boolean>;
  };
  backupRestoreOperator: {
    previewDiff(input: { snapshotId: string; targetProfileId: string }): Promise<{ changedTables: string[]; changedRows: number }>;
    backupCurrent(input: { targetProfileId: string; now: string }): Promise<{ backupSnapshotId: string }>;
    restore(input: { snapshotId: string; targetProfileId: string }): Promise<void>;
    verifyConnection(input: { targetProfileId: string }): Promise<boolean>;
  };
};

export type UseCases = {
  createTaskUseCase: CreateTaskUseCase;
  updateTaskUseCase: UpdateTaskUseCase;
  moveTaskStatusUseCase: MoveTaskStatusUseCase;
  addTaskCommentUseCase: AddTaskCommentUseCase;
  updateTaskCommentUseCase: UpdateTaskCommentUseCase;
  deleteTaskCommentUseCase: DeleteTaskCommentUseCase;
  listTaskCommentsUseCase: ListTaskCommentsUseCase;
  switchDatabaseProfileUseCase: SwitchDatabaseProfileUseCase;
  setReadOnlyModeUseCase: SetReadOnlyModeUseCase;
  setFeatureFlagUseCase: SetFeatureFlagUseCase;
  createBackupSnapshotUseCase: CreateBackupSnapshotUseCase;
  restoreBackupSnapshotUseCase: RestoreBackupSnapshotUseCase;
  mountDatabaseUseCase: MountDatabaseUseCase;
  unmountDatabaseUseCase: UnmountDatabaseUseCase;
  registerDatabaseDirectoryUseCase: RegisterDatabaseDirectoryUseCase;
  scanDatabaseDirectoryUseCase: ScanDatabaseDirectoryUseCase;
  moveTaskBetweenProfilesUseCase: MoveTaskBetweenProfilesUseCase;
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
      switchDatabaseProfileUseCase: new SwitchDatabaseProfileUseCase(
        this.infrastructure.databaseProfileRepository,
        this.infrastructure.authStateReader,
        this.infrastructure.connectionHealthChecker,
        this.infrastructure.osFileAccessChecker
      ),
      setReadOnlyModeUseCase: new SetReadOnlyModeUseCase(this.infrastructure.databaseProfileRepository),
      mountDatabaseUseCase: new MountDatabaseUseCase(
        this.infrastructure.databaseProfileRepository,
        this.infrastructure.osFileAccessChecker,
        this.infrastructure.connectionHealthChecker,
        this.infrastructure.secretStorageService,
        this.infrastructure.idGenerator
      ),
      unmountDatabaseUseCase: new UnmountDatabaseUseCase(this.infrastructure.databaseProfileRepository, this.infrastructure.secretStorageService),
      registerDatabaseDirectoryUseCase: new RegisterDatabaseDirectoryUseCase(
        this.infrastructure.databaseProfileRepository,
        this.infrastructure.osFileAccessChecker,
        this.infrastructure.secretStorageService,
        this.infrastructure.idGenerator
      ),
      scanDatabaseDirectoryUseCase: new ScanDatabaseDirectoryUseCase(
        this.infrastructure.databaseProfileRepository,
        this.infrastructure.osFileAccessChecker,
        this.infrastructure.secretStorageService,
        this.infrastructure.uiEventBus
      ),
      moveTaskBetweenProfilesUseCase: new MoveTaskBetweenProfilesUseCase(
        this.infrastructure.databaseProfileRepository,
        {
          exportTaskGraph: async () => ({}),
          importTaskGraph: async () => undefined,
          softDeleteInSource: async () => undefined
        },
        this.infrastructure.auditLogRepository,
        this.infrastructure.idGenerator
      ),
      setFeatureFlagUseCase: new SetFeatureFlagUseCase(this.infrastructure.featureFlagRepository),
      createBackupSnapshotUseCase: new CreateBackupSnapshotUseCase(
        this.infrastructure.backupSnapshotFactory,
        this.infrastructure.backupSnapshotRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.idGenerator
      ),
      restoreBackupSnapshotUseCase: new RestoreBackupSnapshotUseCase(
        this.infrastructure.backupSnapshotRepository,
        this.infrastructure.snapshotIntegrityVerifier,
        this.infrastructure.backupRestoreOperator,
        this.infrastructure.auditLogRepository,
        this.infrastructure.idGenerator
      )
    };
  }

  public buildProjectTaskLoader(): {
    listProjects(): Promise<Array<{ projectId: string; projectName: string }>>;
    listTasksByProject(input: {
      projectId: string;
      offset: number;
      limit: number;
    }): Promise<Array<{ taskId: string; title: string; status: TaskStatus; priority: Priority; version: number; hasChildren: boolean }>>;
    listSubtasksByParent(parentTaskId: string): Promise<Array<{ taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean }>>;
    listMyTasks(input: {
      userId: string;
      limit: number;
      sortBy: 'updatedAt' | 'priority' | 'dueDate';
    }): Promise<Array<{ taskId: string; projectId: string; title: string; status: TaskStatus; priority: Priority; version: number; hasChildren: boolean }>>;
  } {
    return {
      listProjects: () => this.infrastructure.taskRepository.listProjects(),
      listTasksByProject: (input) => this.infrastructure.taskRepository.listTasksByProject(input),
      listSubtasksByParent: (parentTaskId) => this.infrastructure.taskRepository.listSubtasksByParent(parentTaskId),
      listMyTasks: (input) => this.infrastructure.taskRepository.listMyTasks(input)
    };
  }

  public buildTaskTreeLoader(): {
    listProjects(): Promise<Array<{ projectId: string; projectName: string }>>;
    listTasksWithDetail(projectId: string): Promise<import('../ports/repositories/task-repository.js').TaskTreeNode[]>;
  } {
    return {
      listProjects: () => this.infrastructure.taskRepository.listProjects(),
      listTasksWithDetail: (projectId) => this.infrastructure.taskRepository.listTasksWithDetail(projectId)
    };
  }

  public buildTaskOperator(): Pick<TaskRepository, 'findDetailById' | 'deleteById'> {
    return {
      findDetailById: (taskId) => this.infrastructure.taskRepository.findDetailById(taskId),
      deleteById: (taskId) => this.infrastructure.taskRepository.deleteById(taskId)
    };
  }
}
