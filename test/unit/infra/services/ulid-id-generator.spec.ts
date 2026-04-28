import { describe, expect, it } from 'vitest';
import { Ulid } from '../../../../src/core/domain/value-objects/ulid.js';
import { UlidIdGenerator } from '../../../../src/infra/services/ulid-id-generator.js';

describe('UlidIdGenerator', () => {
  it('generates ULID format identifiers', () => {
    const generator = new UlidIdGenerator();

    const generated = generator.nextUlid();

    expect(() => Ulid.from(generated)).not.toThrow();
  });

  it('generates different IDs on successive calls', () => {
    const generator = new UlidIdGenerator();

    const first = generator.nextUlid();
    const second = generator.nextUlid();

    expect(first).not.toBe(second);
  });
});
