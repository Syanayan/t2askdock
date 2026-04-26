const DUE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_DUE_DATE = '1900-01-01';
const MAX_DUE_DATE = '2100-12-31';

export class DueDate {
  private constructor(public readonly value: string) {}

  public static from(value: string): DueDate {
    const match = DUE_DATE_REGEX.exec(value);
    if (!match) {
      throw new Error('DueDate must be YYYY-MM-DD format');
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error('DueDate must be a valid date');
    }

    if (value < MIN_DUE_DATE || value > MAX_DUE_DATE) {
      throw new Error('DueDate must be between 1900-01-01 and 2100-12-31');
    }

    return new DueDate(value);
  }
}
