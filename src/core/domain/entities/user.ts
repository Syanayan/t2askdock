import { Ulid } from '../value-objects/ulid.js';

export type Role = 'admin' | 'general';
export type UserStatus = 'active' | 'disabled';

export type UserProps = {
  userId: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export class User {
  private constructor(private readonly props: UserProps) {}

  public static from(props: UserProps): User {
    Ulid.from(props.userId);

    if (props.displayName.trim().length < 1) {
      throw new Error('displayName is required');
    }

    return new User(props);
  }

  public get value(): UserProps {
    return this.props;
  }
}
