import { Ulid } from '../value-objects/ulid.js';
import { Version } from '../value-objects/version.js';

export type CommentProps = {
  commentId: string;
  taskId: string;
  body: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
};

const SCRIPT_TAG_REGEX = /<\s*script\b[^>]*>(.*?)<\s*\/\s*script>/gis;

export class Comment {
  private constructor(private readonly props: CommentProps) {}

  public static sanitizeBody(value: string): string {
    return value.replace(SCRIPT_TAG_REGEX, '').trim();
  }

  public static from(props: CommentProps): Comment {
    Ulid.from(props.commentId);
    Ulid.from(props.taskId);
    Ulid.from(props.createdBy);
    Ulid.from(props.updatedBy);
    Version.from(props.version);

    const body = Comment.sanitizeBody(props.body);
    if (body.length < 1 || body.length > 4000) {
      throw new Error('comment body must be between 1 and 4000 chars');
    }

    return new Comment({ ...props, body });
  }

  public get value(): CommentProps {
    return this.props;
  }
}
