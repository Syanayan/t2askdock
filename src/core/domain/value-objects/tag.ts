export class Tag {
  private constructor(public readonly value: string, public readonly normalized: string) {}

  public static from(value: string): Tag {
    const normalized = value.trim().toLowerCase();

    if (normalized.length < 1 || normalized.length > 32) {
      throw new Error('Tag must be between 1 and 32 characters');
    }

    return new Tag(value, normalized);
  }

  public static ensureUnique(tags: Tag[]): void {
    const seen = new Set<string>();

    for (const tag of tags) {
      if (seen.has(tag.normalized)) {
        throw new Error('Tags must be unique (case-insensitive)');
      }

      seen.add(tag.normalized);
    }
  }
}
