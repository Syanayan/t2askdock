import { randomBytes } from 'node:crypto';
import { Ulid } from '../../core/domain/value-objects/ulid.js';
import type { IdGenerator } from '../../core/ports/services/id-generator.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export class UlidIdGenerator implements IdGenerator {
  public nextUlid(): string {
    const timestamp = this.encodeTime(Date.now(), 10);
    const randomness = this.encodeRandom(16);

    return Ulid.from(`${timestamp}${randomness}`).value;
  }

  private encodeTime(timeMs: number, length: number): string {
    let value = timeMs;
    let output = '';

    for (let i = 0; i < length; i += 1) {
      output = CROCKFORD[value % 32] + output;
      value = Math.floor(value / 32);
    }

    return output;
  }

  private encodeRandom(length: number): string {
    const bytes = randomBytes(length);
    let output = '';

    for (let i = 0; i < length; i += 1) {
      output += CROCKFORD[bytes[i] % 32];
    }

    return output;
  }
}
