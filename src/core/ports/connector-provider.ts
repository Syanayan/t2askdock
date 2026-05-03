import type { TaskStatus } from '../domain/entities/task.js';

export type ConnectorConfig = Record<string, unknown>;

export type ExternalIssue = {
  externalId: string;
  title: string;
  description: string | null;
  status: 'open' | 'closed';
  assignee: string | null;
  labels: string[];
  url: string;
};

export interface IConnectorProvider {
  readonly connectorId: string;
  fetchIssues(settings: ConnectorConfig): Promise<ExternalIssue[]>;
  pushStatus?(taskId: string, status: TaskStatus, settings: ConnectorConfig): Promise<void>;
}
