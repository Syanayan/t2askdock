import {
  CreateTaskUseCase,
  type AuditLogRepository,
  type IdGenerator,
  type TaskRepository,
  type TransactionManager
} from '../usecase/create-task-usecase.js';

export type Infrastructure = {
  taskRepository: TaskRepository;
  auditLogRepository: AuditLogRepository;
  transactionManager: TransactionManager;
  idGenerator: IdGenerator;
};

export type UseCases = {
  createTaskUseCase: CreateTaskUseCase;
};

export class AppContainer {
  public constructor(private readonly infrastructure: Infrastructure) {}

  public buildUseCases(): UseCases {
    return {
      createTaskUseCase: new CreateTaskUseCase(
        this.infrastructure.taskRepository,
        this.infrastructure.auditLogRepository,
        this.infrastructure.transactionManager,
        this.infrastructure.idGenerator
      )
    };
  }
}
