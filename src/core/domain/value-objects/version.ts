export class Version {
  private constructor(public readonly value: number) {}

  public static from(value: number): Version {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error('Version must be an integer >= 1');
    }

    return new Version(value);
  }

  public increment(): Version {
    return new Version(this.value + 1);
  }
}
