import { DueDate } from '../value-objects/due-date.js';
import { Tag } from '../value-objects/tag.js';
import { Title } from '../value-objects/title.js';
import { Ulid } from '../value-objects/ulid.js';
import { Version } from '../value-objects/version.js';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type TaskProps = {
  taskId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee: string | null;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  progress: number;
};

export class Task {
  private constructor(private readonly props: TaskProps) {}

  public static from(props: TaskProps): Task {
    Ulid.from(props.taskId);
    Title.from(props.title);
    Version.from(props.version);

    if (props.description !== null && props.description.length > 5000) {
      throw new Error('description must be <= 5000 chars');
    }

    if (props.parentTaskId !== null) {
      Ulid.from(props.parentTaskId);
    }

    if (props.dueDate !== null) {
      DueDate.from(props.dueDate);
    }

    if (!Number.isInteger(props.progress) || props.progress < 0 || props.progress > 100) {
      throw new Error('progress must be integer between 0 and 100');
    }

    if (props.tags.length > 20) {
      throw new Error('tags must be <= 20');
    }

    const tags = props.tags.map((tag) => Tag.from(tag));
    Tag.ensureUnique(tags);

    return new Task(props);
  }

  public get value(): TaskProps {
    return this.props;
  }
}
