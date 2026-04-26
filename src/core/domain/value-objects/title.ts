export class Title {
  private constructor(public readonly value: string) {}

  public static from(value: string): Title {
    const normalized = value.trim();

    if (normalized.length < 1 || normalized.length > 200) {
      throw new Error('Title must be between 1 and 200 characters');
    }

    return new Title(normalized);
  }
}
