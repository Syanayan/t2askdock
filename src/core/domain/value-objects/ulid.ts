const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class Ulid {
  private constructor(public readonly value: string) {}

  public static from(value: string): Ulid {
    if (!ULID_REGEX.test(value)) {
      throw new Error('ULID must be 26 chars in Crockford base32 format');
    }

    return new Ulid(value);
  }
}
