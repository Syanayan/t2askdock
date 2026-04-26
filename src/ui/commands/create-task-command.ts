import type { CreateTaskInput, CreateTaskOutput, CreateTaskUseCase } from '../../core/usecase/create-task-usecase.js';

export class CreateTaskCommand {
  public constructor(private readonly createTaskUseCase: CreateTaskUseCase) {}

  public async run(input: CreateTaskInput): Promise<CreateTaskOutput> {
    return this.createTaskUseCase.execute(input);
  }
}
