import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';

describe('ERROR_CODES', () => {
  it('exposes E_ prefix for all shared error codes', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(code.startsWith('E_')).toBe(true);
    }
  });

  it('contains representative codes defined in the design', () => {
    expect(ERROR_CODES.PERMISSION_DENIED).toBe('E_PERMISSION_DENIED');
    expect(ERROR_CODES.READ_ONLY_MODE).toBe('E_READ_ONLY_MODE');
    expect(ERROR_CODES.TASK_CONFLICT).toBe('E_TASK_CONFLICT');
  });
});
