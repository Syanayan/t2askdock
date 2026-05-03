import type { IConnectorProvider } from '../ports/connector-provider.js';

export class ConnectorRegistry {
  private readonly providers = new Map<string, IConnectorProvider>();

  public register(provider: IConnectorProvider): void {
    this.providers.set(provider.connectorId, provider);
  }

  public get(connectorId: string): IConnectorProvider | null {
    return this.providers.get(connectorId) ?? null;
  }
}
