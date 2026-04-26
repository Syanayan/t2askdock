export type CreateTaskInput = {
  title: string;
};

export type CreateTaskOutput = {
  id: string;
  title: string;
};

export interface TaskWriter {
  create(input: CreateTaskInput): Promise<CreateTaskOutput>;
}

export class CreateTaskUseCase {
  public constructor(private readonly taskWriter: TaskWriter) {}

  public async execute(input: CreateTaskInput): Promise<CreateTaskOutput> {
    return this.taskWriter.create(input);
  }
}
