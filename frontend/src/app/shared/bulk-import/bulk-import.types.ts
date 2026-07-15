export type BulkRowStatus = 'create' | 'update' | 'link' | 'error';
export type BulkDecisionAction = 'create' | 'update' | 'link' | 'skip';

export interface BulkFieldDiff {
  field: string;
  current: unknown;
  incoming: unknown;
}

export interface BulkPreviewRow {
  line: number;
  status: BulkRowStatus;
  key: Record<string, unknown>;
  incoming: Record<string, unknown>;
  existing?: Record<string, unknown>;
  diffs?: BulkFieldDiff[];
  message?: string;
  alreadyLinked?: boolean;
}

export interface BulkPreviewResult {
  previewId: string;
  summary: {
    total: number;
    create: number;
    update: number;
    link: number;
    error: number;
  };
  rows: BulkPreviewRow[];
  updateFields: string[];
}

export interface BulkDecision {
  line: number;
  action: BulkDecisionAction;
  fields?: string[];
}

export interface BulkCommitResult {
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  errors: { line: number; reason: string }[];
  totalDecisions: number;
}

export interface BulkImportAdapters {
  downloadTemplate: () => import('rxjs').Observable<Blob>;
  preview: (file: File) => import('rxjs').Observable<BulkPreviewResult>;
  commit: (previewId: string, decisions: BulkDecision[]) => import('rxjs').Observable<BulkCommitResult>;
  templateFilename?: string;
}
