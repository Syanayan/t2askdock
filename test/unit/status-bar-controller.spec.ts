import { describe, expect, it } from 'vitest';
import { StatusBarController } from '../../src/ui/status/status-bar-controller.js';
import { ExtensionStateStore } from '../../src/ui/state/extension-state-store.js';

describe('StatusBarController', () => {
  it('shows active profile name when present', () => {
    const store = new ExtensionStateStore();
    store.patch({ activeProfile: 'p1', activeProfileName: 'Project A' });
    const snapshot = new StatusBarController(store).snapshot();
    expect(snapshot.db).toBe('DB:Project A');
  });
});
