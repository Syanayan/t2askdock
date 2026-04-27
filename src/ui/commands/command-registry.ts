import type { CreateTaskInput, CreateTaskOutput, CreateTaskUseCase } from '../../core/usecase/create-task-usecase.js';
import type { SetReadOnlyModeUseCase } from '../../core/usecase/db/set-read-only-mode-usecase.js';
import type { SwitchDatabaseProfileUseCase } from '../../core/usecase/db/switch-database-profile-usecase.js';
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
    private readonly stateStore: ExtensionStateStore,
    private readonly eventBus: UiEventBus
  ) {}

  public register(): RegisteredCommands {
    return {
      'taskDock.openTree': () => ({ viewId: 'taskDock.treeView' }),
      'taskDock.openBoard': () => ({ viewId: 'taskDock.boardView' }),
      'taskDock.selectDatabase': async ({ profileId }) => {
        const output = await this.switchDatabaseProfileUseCase.execute({ profileId });
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
