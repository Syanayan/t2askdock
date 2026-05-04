export type ConnectionMode = 'readWrite' | 'readOnly';
export type HealthStatus = 'healthy' | 'degraded' | 'unreachable';

export type ExtensionState = {
  activeProfile: string | null;
  activeProfileName: string | null;
  connectionMode: ConnectionMode;
  healthStatus: HealthStatus;
  currentUser: { userId: string; role: 'admin' | 'general' } | null;
};

export class ExtensionStateStore {
  private state: ExtensionState = {
    activeProfile: null,
    activeProfileName: null,
    connectionMode: 'readWrite',
    healthStatus: 'healthy',
    currentUser: null
  };

  public getState(): Readonly<ExtensionState> {
    return this.state;
  }

  public patch(next: Partial<ExtensionState>): Readonly<ExtensionState> {
    this.state = { ...this.state, ...next };
    return this.state;
  }
}
