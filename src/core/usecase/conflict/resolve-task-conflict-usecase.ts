import { ERROR_CODES } from '../../errors/error-codes.js';

export type TaskConflictSnapshot = {
  taskId: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee: string | null;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  version: number;
  updatedAt: string;
  updatedBy: string;
};

export type ResolveStrategy = 'LOCAL' | 'REMOTE' | 'MANUAL';

export type ResolveTaskConflictInput = {
  strategy: ResolveStrategy;
  local: TaskConflictSnapshot;
  remote: TaskConflictSnapshot | null;
  manual?: TaskConflictSnapshot;
};

export type ResolveTaskConflictOutput = {
  resolved: TaskConflictSnapshot;
  source: ResolveStrategy;
};

export class ResolveTaskConflictUseCase {
  public execute(input: ResolveTaskConflictInput): ResolveTaskConflictOutput {
    if (input.strategy === 'LOCAL') {
      return { resolved: input.local, source: 'LOCAL' };
    }

    if (input.strategy === 'REMOTE') {
      if (input.remote === null) {
        throw new Error(ERROR_CODES.TASK_CONFLICT);
      }
      return { resolved: input.remote, source: 'REMOTE' };
    }

    if (input.manual === undefined) {
      throw new Error(ERROR_CODES.VALIDATION_FAILED);
    }

    return { resolved: input.manual, source: 'MANUAL' };
  }
}
