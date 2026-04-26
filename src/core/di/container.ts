import { CreateTaskUseCase, type TaskWriter } from '../usecase/create-task-usecase.js';

export type Infrastructure = {
  taskWriter: TaskWriter;
};

export type UseCases = {
  createTaskUseCase: CreateTaskUseCase;
};

export class AppContainer {
  public constructor(private readonly infrastructure: Infrastructure) {}

  public buildUseCases(): UseCases {
    return {
      createTaskUseCase: new CreateTaskUseCase(this.infrastructure.taskWriter)
    };
  }
}
