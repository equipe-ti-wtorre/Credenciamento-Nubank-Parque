export type BlocklistPeriodType = 'permanent' | 'days' | 'events';

export interface BlocklistNoticeInfo {
  is_blocklisted?: boolean;
  blocklist_reason?: string | null;
  reason?: string | null;
  block_type?: BlocklistPeriodType | string | null;
  block_value?: number | null;
  blocked_until?: string | null;
  remaining_days?: number | null;
  remaining_events?: number | null;
}

export function formatBlocklistPeriod(info: BlocklistNoticeInfo | null | undefined): string {
  if (!info) return '';
  if (info.block_type === 'days') {
    const days = info.remaining_days;
    if (days == null) return 'Bloqueio por prazo.';
    if (days <= 0) return 'O prazo de bloqueio encerrou.';
    return days === 1 ? 'Resta 1 dia de bloqueio.' : `Restam ${days} dias de bloqueio.`;
  }
  if (info.block_type === 'events') {
    const left = info.remaining_events;
    if (left == null) return 'Bloqueio por eventos.';
    if (left <= 0) return 'O prazo de bloqueio por eventos encerrou.';
    return left === 1 ? 'Falta 1 evento sem acesso.' : `Faltam ${left} eventos sem acesso.`;
  }
  if (info.block_type === 'permanent') return 'Bloqueio permanente.';
  return '';
}

export function formatBlocklistNotice(info: BlocklistNoticeInfo | null | undefined): string {
  const parts = ['Este colaborador está impedido de acessar a arena.'];
  const reason = info?.blocklist_reason || info?.reason;
  if (reason) parts.push(`Motivo: ${reason}.`);
  const period = formatBlocklistPeriod(info);
  if (period) parts.push(period);
  return parts.join(' ');
}

export function extractBlocklistNotice(err: unknown, fallback?: string): string | null {
  if (!err || typeof err !== 'object') return fallback || null;
  const http = err as {
    error?: {
      code?: string;
      message?: string;
      details?: BlocklistNoticeInfo;
    };
    status?: number;
  };
  const body = http.error;
  if (!body || typeof body !== 'object') return fallback || null;
  if (body.code === 'COLLABORATOR_BLOCKLISTED') {
    if (body.details) return formatBlocklistNotice(body.details);
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  }
  return fallback || null;
}
