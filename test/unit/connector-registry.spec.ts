import { describe, expect, it } from 'vitest';
import { ConnectorRegistry } from '../../src/core/connector/connector-registry.js';
import type { IConnectorProvider } from '../../src/core/ports/connector-provider.js';

describe('ConnectorRegistry', () => {
  it('registers and resolves provider by connectorId', () => {
    const registry = new ConnectorRegistry();
    const provider: IConnectorProvider = {
      connectorId: 'github',
      fetchIssues: async () => []
    };

    registry.register(provider);

    expect(registry.get('github')).toBe(provider);
    expect(registry.get('gitlab')).toBeNull();
  });
});
