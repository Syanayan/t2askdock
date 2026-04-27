export type UiEventName =
  | 'PROFILE_SWITCHED'
  | 'MODE_CHANGED'
  | 'TASK_UPDATED'
  | 'CONFLICT_DETECTED'
  | 'AUTH_EXPIRED'
  | 'CONNECTION_HEALTH_CHANGED'
  | 'ARCHIVE_SEARCH_COMPLETED';

export type UiEvent<TName extends UiEventName = UiEventName, TPayload = unknown> = {
  type: TName;
  payload: TPayload;
};

type Handler = (event: UiEvent) => void;

export class UiEventBus {
  private readonly handlers = new Map<UiEventName, Set<Handler>>();

  public subscribe<TName extends UiEventName>(type: TName, handler: (event: UiEvent<TName>) => void): () => void {
    const registered = this.handlers.get(type) ?? new Set<Handler>();
    registered.add(handler as Handler);
    this.handlers.set(type, registered);
    return () => {
      registered.delete(handler as Handler);
    };
  }

  public publish<TName extends UiEventName>(event: UiEvent<TName>): void {
    const registered = this.handlers.get(event.type);
    if (!registered) {
      return;
    }

    for (const handler of registered) {
      handler(event);
    }
  }
}
