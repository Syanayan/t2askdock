import type { CreateTaskInput, CreateTaskOutput, CreateTaskUseCase } from '../../core/usecase/create-task-usecase.js';
import type { SetReadOnlyModeUseCase } from '../../core/usecase/db/set-read-only-mode-usecase.js';
import type { SwitchDatabaseProfileUseCase } from '../../core/usecase/db/switch-database-profile-usecase.js';
import { INITIAL_MIGRATION_V1_SQL } from '../../infra/sqlite/migrations/initial-migration-v1.js';
import { MIGRATION_V2_SQL } from '../../infra/sqlite/migrations/initial-migration-v2.js';
import { MIGRATION_V3_SQL } from '../../infra/sqlite/migrations/initial-migration-v3.js';
import { Migrator } from '../../infra/sqlite/migrations/migrator.js';
import type { ActiveClientHolder } from '../../infra/sqlite/active-client-holder.js';
import type { SqliteClient } from '../../infra/sqlite/sqlite-client.js';
import type { ExtensionStateStore } from '../state/extension-state-store.js';
import type { UiEventBus } from '../events/ui-event-bus.js';

export type RegisteredCommands = {
  'taskDock.openTree': () => { viewId: 'taskDock.treeView' };
  'taskDock.openBoard': () => { viewId: 'taskDock.boardView' };
  'taskDock.selectDatabase': (input: { profileId: string }) => ReturnType<SwitchDatabaseProfileUseCase['execute']>;
  'taskDock.toggleReadOnly': (input: { profileId: string; enabled: boolean; actorRole: 'admin' | 'general' }) => ReturnType<
    SetReadOnlyModeUseCase['execute']
  >;
  'taskDock.createTask': (input: CreateTaskInput) => Promise<CreateTaskOutput>;
};

export class TaskDockCommandRegistry {
  public constructor(
    private readonly createTaskUseCase: CreateTaskUseCase,
    private readonly switchDatabaseProfileUseCase: SwitchDatabaseProfileUseCase,
    private readonly setReadOnlyModeUseCase: SetReadOnlyModeUseCase,
    private readonly activeClientHolder: ActiveClientHolder,
    private readonly createNewClient: (path: string) => SqliteClient,
    private readonly stateStore: ExtensionStateStore,
    private readonly eventBus: UiEventBus
  ) {}

  public register(): RegisteredCommands {
    return {
      'taskDock.openTree': () => ({ viewId: 'taskDock.treeView' }),
      'taskDock.openBoard': () => ({ viewId: 'taskDock.boardView' }),
      'taskDock.selectDatabase': async ({ profileId }) => {
        const output = await this.switchDatabaseProfileUseCase.execute({ profileId });
        const newClient = this.createNewClient(output.profileSummary.path);
        const migrator = new Migrator({
          client: newClient,
          snapshot: async () => undefined,
          restoreSnapshot: async () => undefined,
          reconnectReadOnly: async () => undefined,
          appendMigrationFailedAudit: async () => undefined
        });
        await migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }, { version: 2, statements: MIGRATION_V2_SQL }, { version: 3, statements: MIGRATION_V3_SQL }]);
        this.activeClientHolder.switch(newClient);
        this.stateStore.patch({
          activeProfile: output.profileSummary.profileId,
          connectionMode: output.connectionMode,
          healthStatus: output.healthStatus
        });
        this.eventBus.publish({ type: 'PROFILE_SWITCHED', payload: output.profileSummary });
        return output;
      },
      'taskDock.toggleReadOnly': async input => {
        const output = await this.setReadOnlyModeUseCase.execute(input);
        this.stateStore.patch({ connectionMode: output.mode });
        this.eventBus.publish({ type: 'MODE_CHANGED', payload: output });
        return output;
      },
      'taskDock.createTask': async input => {
        const output = await this.createTaskUseCase.execute(input);
        this.eventBus.publish({ type: 'TASK_UPDATED', payload: { taskId: output.id } });
        return output;
      }
    };
  }
}
