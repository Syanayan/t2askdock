import type { UiEventBus } from '../events/ui-event-bus.js';

export type AuditLogSearchResult = {
  source: 'online' | 'archive';
  logId: string;
  actionType: string;
  createdAt: string;
};

export type AuditSearcher = {
  search(input: { from: string; to: string; includeArchive: boolean; keyword?: string }): Promise<AuditLogSearchResult[]>;
};

export type PurgeAuditArchiveUseCase = {
  execute(input: { from: string; to: string; actorId: string; dryRun: boolean }): Promise<{ affectedRows: number }>;
};

export class ArchiveAuditSearchPanel {
  public constructor(
    private readonly auditSearcher: AuditSearcher,
    private readonly purgeAuditArchiveUseCase: PurgeAuditArchiveUseCase,
    private readonly eventBus: UiEventBus
  ) {}

  public async search(input: { from: string; to: string; keyword?: string }): Promise<{ includeArchive: boolean; items: AuditLogSearchResult[] }> {
    const includeArchive = exceeds90Days(input.from, input.to);
    const items = await this.auditSearcher.search({ ...input, includeArchive });
    this.eventBus.publish({
      type: 'ARCHIVE_SEARCH_COMPLETED',
      payload: { total: items.length, includeArchive }
    });
    return { includeArchive, items };
  }

  public async purgeDryRun(input: { from: string; to: string; actorId: string }): Promise<{ affectedRows: number }> {
    return this.purgeAuditArchiveUseCase.execute({ ...input, dryRun: true });
  }

  public async purgeExecute(input: { from: string; to: string; actorId: string }): Promise<{ affectedRows: number }> {
    return this.purgeAuditArchiveUseCase.execute({ ...input, dryRun: false });
  }
}

const exceeds90Days = (from: string, to: string): boolean => {
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  return diffMs > 90 * 24 * 60 * 60 * 1000;
};
