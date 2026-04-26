import type { TaskStatus } from '../domain/entities/task.js';
import { UpdateTaskUseCase, type UpdateTaskInput, type UpdateTaskOutput } from './update-task-usecase.js';

export type MoveTaskStatusInput = Omit<UpdateTaskInput, 'status'> & {
  toStatus: TaskStatus;
};

export class MoveTaskStatusUseCase {
  public constructor(private readonly updateTaskUseCase: UpdateTaskUseCase) {}

  public async execute(input: MoveTaskStatusInput): Promise<UpdateTaskOutput> {
    return this.updateTaskUseCase.execute({
      ...input,
      status: input.toStatus
    });
  }
}
