import type { ConnectionMode, ExtensionStateStore, HealthStatus } from '../state/extension-state-store.js';

export type StatusBarSnapshot = {
  db: string;
  mode: `Mode:${'RW' | 'RO'}`;
  health: `Health:${'Healthy' | 'Degraded' | 'Unsafe'}`;
  reconnectCommand: 'taskDock.selectDatabase' | null;
};

export class StatusBarController {
  public constructor(private readonly stateStore: ExtensionStateStore) {}

  public snapshot(): StatusBarSnapshot {
    const state = this.stateStore.getState();
    return {
      db: `DB:${state.activeProfile ?? 'unselected'}`,
      mode: `Mode:${toModeLabel(state.connectionMode)}`,
      health: `Health:${toHealthLabel(state.healthStatus)}`,
      reconnectCommand: state.healthStatus === 'unreachable' ? 'taskDock.selectDatabase' : null
    };
  }
}

const toModeLabel = (mode: ConnectionMode): 'RW' | 'RO' => (mode === 'readOnly' ? 'RO' : 'RW');

const toHealthLabel = (status: HealthStatus): 'Healthy' | 'Degraded' | 'Unsafe' => {
  if (status === 'healthy') {
    return 'Healthy';
  }

  if (status === 'degraded') {
    return 'Degraded';
  }

  return 'Unsafe';
};
