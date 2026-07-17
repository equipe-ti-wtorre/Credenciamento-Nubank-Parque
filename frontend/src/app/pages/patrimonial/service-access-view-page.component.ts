import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  PatrimonialService,
  ServiceAccessCollaborator,
  ServiceAccessHistoryItem,
  ServiceAccessItem,
  ServiceAccessVehicle,
} from '../../services/patrimonial.service';
import { CollaboratorService } from '../../services/collaborator.service';
import {
  ApprovalHistoryItem,
  ApprovalItem,
  ApprovalService,
} from '../../services/approval.service';
import { NotificationService } from '../../core/services/notification.service';
import { TeamsContextService } from '../../services/teams-context.service';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, hh, mm] = match;
    return `${d}/${m}/${y} · ${hh}:${mm}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} · ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

function formatTimeBr(value: string | null | undefined): string {
  if (!value) return '—';
  const match = String(value).match(/[ T](\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function dateKey(value: string | null | undefined): string {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function formatLongDateBr(dayKeyValue: string): string {
  const [y, m, d] = dayKeyValue.split('-').map(Number);
  if (!y || !m || !d) return dayKeyValue;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatDoc(doc: string | null | undefined): string {
  const digits = String(doc || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return String(doc || '—');
}

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ColabFilter = 'all' | 'in' | 'wait';
type ColabView = 'group' | 'list';

interface ColabCard {
  id: number;
  name: string;
  document: string;
  role: string;
  picture: string | null;
  status: 'in' | 'wait';
  dayKey: string | null;
  time: string | null;
  checkOut: string | null;
}

interface ColabGroup {
  key: string;
  label: string;
  isToday: boolean;
  isWaiting: boolean;
  count: number;
  items: ColabCard[];
}

/**
 * Página focada em um acesso de serviço — deep link do Teams (/acessos-servico/:id).
 * Layout de protocolo com histórico de acessos agrupado por dia.
 */
@Component({
  selector: 'app-service-access-view-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

      :host {
        --sav-wtorre: #1d54e6;
        --sav-wtorre-soft: #eef3ff;
        --sav-font-display: 'Sora', system-ui, sans-serif;
        --sav-font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
        --sav-ink: #0f172a;
        --sav-muted: #64748b;
        --sav-faint: #94a3b8;
        --sav-line: #eef1f6;
        --sav-line-strong: #e6eaf2;
        --sav-card: #fff;
        --sav-ok: #16a34a;
        --sav-ok-bg: #e7f6ed;
        --sav-ok-line: #c7ebd4;
        --sav-wait: #d97706;
        --sav-wait-bg: #fdf3e2;
        --sav-wait-line: #f4dcae;
        --sav-danger: #dc2626;
        --sav-danger-bg: #fef2f2;
        --sav-danger-line: #fecaca;
        --sav-radius: 18px;
        display: block;
        font-family: var(--sav-font-body);
        color: var(--sav-ink);
        -webkit-font-smoothing: antialiased;
      }

      .sav-page {
        min-height: 100vh;
        background: linear-gradient(180deg, #f6f8fc, #e9edf6);
        padding: 26px 18px 40px;
      }
      .sav-wrap {
        max-width: 800px;
        margin: 0 auto;
      }
      .sav-icn {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .sav-card {
        background: var(--sav-card);
        border-radius: var(--sav-radius);
        border: 1px solid var(--sav-line);
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
        overflow: hidden;
      }

      .sav-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding: 0 4px;
        gap: 12px;
      }
      .sav-crumb {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--sav-faint);
      }
      .sav-title {
        font-family: var(--sav-font-display);
        font-size: 21px;
        font-weight: 700;
        margin-top: 3px;
      }
      .sav-title .hash {
        color: var(--sav-wtorre);
      }
      .sav-ghost {
        height: 38px;
        padding: 0 15px;
        border-radius: 999px;
        border: 1px solid var(--sav-line-strong);
        background: var(--sav-card);
        font-family: var(--sav-font-body);
        font-weight: 600;
        font-size: 13px;
        color: var(--sav-ink);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        transition: 0.15s;
      }
      .sav-ghost:hover {
        border-color: var(--sav-wtorre);
        color: var(--sav-wtorre);
      }

      .sav-status-head {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px 26px;
        border-bottom: 1px solid var(--sav-line);
        background: linear-gradient(120deg, #f4faf6, #ffffff 55%);
      }
      .sav-status-head.is-danger {
        background: linear-gradient(120deg, #fef6f6, #ffffff 55%);
      }
      .sav-status-head.is-warn {
        background: linear-gradient(120deg, #fff9f0, #ffffff 55%);
      }
      .sav-status-rail {
        width: 5px;
        height: 42px;
        border-radius: 999px;
        background: var(--sav-ok);
      }
      .sav-status-head.is-danger .sav-status-rail {
        background: var(--sav-danger);
      }
      .sav-status-head.is-warn .sav-status-rail {
        background: var(--sav-wait);
      }
      .sav-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border-radius: 999px;
        padding: 6px 14px;
        font-weight: 700;
        font-size: 13.5px;
        background: var(--sav-ok-bg);
        color: var(--sav-ok);
        border: 1px solid var(--sav-ok-line);
      }
      .sav-status-badge.is-danger {
        background: var(--sav-danger-bg);
        color: var(--sav-danger);
        border-color: var(--sav-danger-line);
      }
      .sav-status-badge.is-warn {
        background: var(--sav-wait-bg);
        color: var(--sav-wait);
        border-color: var(--sav-wait-line);
      }
      .sav-status-badge .d {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
      }
      .sav-status-sub {
        font-size: 12.5px;
        color: var(--sav-muted);
        margin-top: 3px;
      }
      .sav-status-meta {
        margin-left: auto;
        text-align: right;
      }
      .sav-status-meta .lab {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sav-faint);
      }
      .sav-status-meta .val {
        font-family: var(--sav-font-display);
        font-size: 15px;
        font-weight: 600;
        margin-top: 2px;
        color: var(--sav-wtorre);
      }

      .sav-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2px 0;
        padding: 18px 26px 6px;
      }
      .sav-info .f {
        display: flex;
        gap: 11px;
        padding: 11px 0;
        align-items: flex-start;
      }
      .sav-info .ib {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: var(--sav-wtorre-soft);
        color: var(--sav-wtorre);
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .sav-info .k {
        font-size: 11px;
        font-weight: 600;
        color: var(--sav-faint);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .sav-info .v {
        font-size: 14.5px;
        font-weight: 600;
        margin-top: 2px;
      }
      .sav-info .full {
        grid-column: 1 / -1;
        border-top: 1px dashed var(--sav-line-strong);
        margin-top: 6px;
        padding-top: 14px;
      }

      .sav-section {
        padding: 20px 26px;
        border-top: 1px solid var(--sav-line);
      }
      .sav-sec-head {
        display: flex;
        align-items: center;
        gap: 9px;
        flex-wrap: wrap;
      }
      .sav-sec-head svg {
        color: var(--sav-faint);
      }
      .sav-sec-head .st {
        font-family: var(--sav-font-display);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--sav-muted);
      }
      .sav-sec-head .count {
        background: var(--sav-wtorre-soft);
        color: var(--sav-wtorre);
        border-radius: 999px;
        font-size: 11.5px;
        font-weight: 700;
        padding: 2px 9px;
        min-width: 22px;
        text-align: center;
      }

      .sav-req-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px 22px;
        margin-top: 15px;
      }
      .sav-req .k {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--sav-faint);
        margin-bottom: 5px;
      }
      .sav-req .who {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sav-req .av {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--sav-wtorre-soft);
        color: var(--sav-wtorre);
        display: grid;
        place-items: center;
        font-weight: 700;
        font-size: 12px;
        font-family: var(--sav-font-display);
      }
      .sav-req .nm {
        font-weight: 600;
        font-size: 14px;
        line-height: 1.2;
      }
      .sav-req .rl {
        font-size: 12px;
        color: var(--sav-faint);
        margin-top: 1px;
      }
      .sav-req .plain {
        font-size: 14px;
        font-weight: 600;
      }
      .sav-req .plain small {
        display: block;
        font-weight: 500;
        color: var(--sav-faint);
        font-size: 12px;
        margin-top: 2px;
      }

      .sav-trail {
        position: relative;
        padding-left: 30px;
        margin-top: 15px;
      }
      .sav-trail::before {
        content: '';
        position: absolute;
        left: 11px;
        top: 8px;
        bottom: 8px;
        width: 2px;
        background: var(--sav-line-strong);
      }
      .sav-tr {
        position: relative;
        padding-bottom: 18px;
      }
      .sav-tr:last-child {
        padding-bottom: 0;
      }
      .sav-tr .node {
        position: absolute;
        left: -30px;
        top: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: #fff;
        border: 2px solid var(--sav-ok);
        color: var(--sav-ok);
        font-size: 11px;
        font-weight: 700;
      }
      .sav-tr .node.is-create {
        border-color: var(--sav-wtorre);
        color: var(--sav-wtorre);
      }
      .sav-tr .node.is-reject {
        border-color: var(--sav-danger);
        color: var(--sav-danger);
      }
      .sav-tr .top {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .sav-tr .lvl {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--sav-wtorre);
        background: var(--sav-wtorre-soft);
        border-radius: 999px;
        padding: 2px 8px;
      }
      .sav-tr .act {
        font-weight: 600;
        font-size: 14px;
      }
      .sav-tr .dec {
        font-size: 11.5px;
        font-weight: 700;
        border-radius: 999px;
        padding: 2px 9px;
        margin-left: auto;
        background: var(--sav-ok-bg);
        color: var(--sav-ok);
      }
      .sav-tr .dec.is-reject {
        background: var(--sav-danger-bg);
        color: var(--sav-danger);
      }
      .sav-tr .meta {
        font-size: 12.5px;
        color: var(--sav-faint);
        margin-top: 3px;
      }
      .sav-tr .comment {
        font-size: 12.5px;
        color: var(--sav-muted);
        margin-top: 6px;
        background: #fafbfe;
        border: 1px solid var(--sav-line);
        border-left: 3px solid var(--sav-wtorre);
        border-radius: 8px;
        padding: 8px 11px;
      }

      .sav-stats {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .sav-stat {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 12.5px;
        font-weight: 600;
      }
      .sav-stat .d {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .sav-stat.ok {
        color: var(--sav-ok);
      }
      .sav-stat.ok .d {
        background: var(--sav-ok);
      }
      .sav-stat.wait {
        color: var(--sav-wait);
      }
      .sav-stat.wait .d {
        background: var(--sav-wait);
      }
      .sav-track {
        width: 60px;
        height: 6px;
        border-radius: 999px;
        background: var(--sav-line-strong);
        overflow: hidden;
      }
      .sav-track .fill {
        height: 100%;
        background: var(--sav-ok);
        border-radius: 999px;
      }

      .sav-toolbar {
        display: flex;
        gap: 10px;
        align-items: center;
        margin: 15px 0 4px;
        flex-wrap: wrap;
      }
      .sav-search {
        flex: 1;
        min-width: 190px;
        height: 40px;
        border: 1px solid var(--sav-line-strong);
        border-radius: 999px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 15px;
        color: var(--sav-faint);
        background: #fff;
      }
      .sav-search input {
        border: 0;
        outline: 0;
        flex: 1;
        font-family: var(--sav-font-body);
        font-size: 13.5px;
        color: var(--sav-ink);
        background: transparent;
        min-width: 0;
      }
      .sav-seg {
        display: flex;
        background: #f4f6fb;
        border-radius: 999px;
        padding: 4px;
      }
      .sav-seg button {
        border: 0;
        background: transparent;
        height: 32px;
        padding: 0 14px;
        border-radius: 999px;
        font-family: var(--sav-font-body);
        font-weight: 600;
        font-size: 12.5px;
        color: var(--sav-muted);
        cursor: pointer;
        white-space: nowrap;
      }
      .sav-seg button.active {
        background: #fff;
        color: var(--sav-wtorre);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
      }
      .sav-viewtog {
        display: flex;
        background: #f4f6fb;
        border-radius: 999px;
        padding: 4px;
      }
      .sav-viewtog button {
        border: 0;
        background: transparent;
        width: 34px;
        height: 32px;
        border-radius: 999px;
        color: var(--sav-faint);
        cursor: pointer;
        display: grid;
        place-items: center;
      }
      .sav-viewtog button.active {
        background: #fff;
        color: var(--sav-wtorre);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
      }
      .sav-viewtog svg {
        width: 16px;
        height: 16px;
      }

      .sav-group {
        margin-top: 16px;
      }
      .sav-group-head {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-bottom: 10px;
      }
      .sav-group-head .gdot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--sav-wtorre);
      }
      .sav-group-head.wait .gdot {
        background: var(--sav-wait);
      }
      .sav-group-head .gd {
        font-family: var(--sav-font-display);
        font-size: 13px;
        font-weight: 700;
      }
      .sav-group-head .gc {
        font-size: 11.5px;
        font-weight: 600;
        color: var(--sav-faint);
        background: #f4f6fb;
        border-radius: 999px;
        padding: 2px 9px;
      }
      .sav-group-head .today {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--sav-wtorre);
        background: var(--sav-wtorre-soft);
        border-radius: 999px;
        padding: 2px 8px;
      }
      .sav-group-head .gl {
        flex: 1;
        height: 1px;
        background: var(--sav-line);
      }

      .sav-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 9px;
      }
      .sav-grid.list {
        grid-template-columns: 1fr;
      }
      .sav-cc {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 9px 12px;
        border: 1px solid var(--sav-line-strong);
        border-radius: 12px;
        min-width: 0;
        background: #fff;
      }
      .sav-cc .av,
      .sav-cc .avph {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .sav-cc .av {
        object-fit: cover;
      }
      .sav-cc .avph {
        background: var(--sav-wtorre-soft);
        color: var(--sav-wtorre);
        display: grid;
        place-items: center;
        font-weight: 700;
        font-family: var(--sav-font-display);
        font-size: 12.5px;
      }
      .sav-cc .main {
        min-width: 0;
        flex: 1;
      }
      .sav-cc .nm {
        font-weight: 600;
        font-size: 13.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sav-cc .mt {
        font-size: 11.5px;
        color: var(--sav-faint);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 1px;
      }
      .sav-cc .mt b {
        color: var(--sav-muted);
        font-weight: 600;
      }
      .sav-cc .stt {
        flex-shrink: 0;
        text-align: right;
      }
      .sav-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-radius: 999px;
        padding: 4px 9px;
        font-size: 11.5px;
        font-weight: 700;
        white-space: nowrap;
      }
      .sav-chip.in {
        background: var(--sav-ok-bg);
        color: var(--sav-ok);
        border: 1px solid var(--sav-ok-line);
      }
      .sav-chip.in .d {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--sav-ok);
      }
      .sav-chip.wait {
        background: var(--sav-wait-bg);
        color: var(--sav-wait);
        border: 1px solid var(--sav-wait-line);
      }
      .sav-cc .when {
        font-size: 10.5px;
        color: var(--sav-faint);
        margin-top: 3px;
      }

      .sav-empty {
        display: flex;
        align-items: center;
        gap: 12px;
        border: 1.5px dashed var(--sav-line-strong);
        border-radius: 14px;
        padding: 16px;
        color: var(--sav-faint);
        font-size: 13.5px;
        font-weight: 500;
        margin-top: 14px;
      }
      .sav-empty svg {
        width: 22px;
        height: 22px;
      }

      .sav-vc {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 10px 12px;
        border: 1px solid var(--sav-line-strong);
        border-radius: 12px;
        margin-top: 10px;
      }
      .sav-vc .plate {
        font-weight: 700;
        font-size: 14px;
        font-family: var(--sav-font-display);
      }
      .sav-vc .sub {
        font-size: 12px;
        color: var(--sav-faint);
      }

      .sav-loading,
      .sav-error {
        border-radius: var(--sav-radius);
        background: #fff;
        border: 1px solid var(--sav-line);
        padding: 32px;
        text-align: center;
      }
      .sav-error p {
        color: var(--sav-danger);
        font-size: 14px;
      }
      .sav-retry {
        margin-top: 14px;
        border: 0;
        background: transparent;
        color: var(--sav-wtorre);
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
      }

      @media (max-width: 560px) {
        .sav-info,
        .sav-req-grid,
        .sav-grid {
          grid-template-columns: 1fr;
        }
        .sav-status-meta {
          display: none;
        }
      }
    `,
  ],
  template: `
    <div class="sav-page" [class.min-h-screen]="standaloneShell()">
      <div class="sav-wrap">
        <div *ngIf="loading()" class="sav-loading">Carregando acesso de serviço…</div>

        <div *ngIf="!loading() && error()" class="sav-error">
          <p>{{ error() }}</p>
          <button type="button" class="sav-retry" (click)="carregar()">Tentar de novo</button>
        </div>

        <ng-container *ngIf="!loading() && service() as svc">
          <div class="sav-card">
            <div class="sav-status-head" [ngClass]="statusHeadClass(svc.id_access_status)">
              <div class="sav-status-rail"></div>
              <div>
                <span class="sav-status-badge" [ngClass]="statusBadgeTone(svc.id_access_status)">
                  <span class="d"></span>
                  {{ svc.access_status_description || '—' }}
                </span>
                <div class="sav-status-sub">{{ statusSubtitle(svc) }}</div>
              </div>
              <div class="sav-status-meta">
                <div class="lab">Protocolo</div>
                <div class="val">#{{ svc.id_service_access }}</div>
              </div>
            </div>

            <div class="sav-info">
              <div class="f">
                <div class="ib">
                  <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </div>
                <div>
                  <div class="k">Finalidade</div>
                  <div class="v">{{ svc.finalidade || '—' }}</div>
                </div>
              </div>
              <div class="f">
                <div class="ib">
                  <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <div>
                  <div class="k">Período</div>
                  <div class="v">
                    {{ formatDateBr(svc.start_date) }} – {{ formatDateBr(svc.end_date) }}
                  </div>
                </div>
              </div>
              <div class="f">
                <div class="ib">
                  <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
                  </svg>
                </div>
                <div>
                  <div class="k">Empresa</div>
                  <div class="v">{{ svc.company_fancy_name || '—' }}</div>
                </div>
              </div>
              <div class="f">
                <div class="ib">
                  <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <div>
                  <div class="k">Setor</div>
                  <div class="v">{{ svc.setor_nome || svc.requesting_department || '—' }}</div>
                </div>
              </div>
              <div class="f full" *ngIf="svc.observacao">
                <div class="ib">
                  <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16v12H8l-4 4z" />
                  </svg>
                </div>
                <div>
                  <div class="k">Observação</div>
                  <div class="v" style="font-weight:500;color:var(--sav-muted)">
                    {{ svc.observacao }}
                  </div>
                </div>
              </div>
            </div>

            <div class="sav-section">
              <div class="sav-sec-head">
                <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6M9 13h6M9 17h4" />
                </svg>
                <span class="st">Solicitação</span>
              </div>
              <div class="sav-req-grid">
                <div class="sav-req">
                  <div class="k">Solicitado por</div>
                  <div class="who">
                    <div class="av">{{ initials(svc.solicitante?.nome || '') }}</div>
                    <div>
                      <div class="nm">{{ svc.solicitante?.nome || '—' }}</div>
                      <div class="rl" *ngIf="svc.solicitante?.email">
                        {{ svc.solicitante?.email }}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="sav-req">
                  <div class="k">Tipo de acesso</div>
                  <div class="plain">
                    Acesso de serviço
                    <small>Credenciamento por período</small>
                  </div>
                </div>
                <div class="sav-req">
                  <div class="k">Solicitado em</div>
                  <div class="plain">
                    {{ formatDateTimeBr(svc.criado_em) }}
                    <small>Protocolo aberto</small>
                  </div>
                </div>
                <div class="sav-req" *ngIf="approval() as ap">
                  <div class="k">Situação da aprovação</div>
                  <div
                    class="plain"
                    [style.color]="ap.status === 'APROVADO' ? 'var(--sav-ok)' : undefined"
                  >
                    {{ ap.status }}
                    <small *ngIf="ap.finalizadoEm">
                      {{ formatDateTimeBr(ap.finalizadoEm) }}
                    </small>
                    <small *ngIf="!ap.finalizadoEm">
                      Nível {{ ap.nivelAtual }} de {{ ap.niveisExigidos }}
                    </small>
                  </div>
                </div>
              </div>
            </div>

            <div class="sav-section" *ngIf="approvalTrail().length">
              <div class="sav-sec-head">
                <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                <span class="st">Fluxo de aprovação</span>
              </div>
              <div class="sav-trail">
                <div class="sav-tr" *ngFor="let step of approvalTrail()">
                  <div
                    class="node"
                    [class.is-create]="step.tone === 'create'"
                    [class.is-reject]="step.tone === 'reject'"
                  >
                    {{ step.tone === 'ok' ? '✓' : step.tone === 'reject' ? '!' : '●' }}
                  </div>
                  <div class="top">
                    <span class="act">{{ step.title }}</span>
                    <span class="dec" *ngIf="step.decision" [class.is-reject]="step.tone === 'reject'">
                      {{ step.decision }}
                    </span>
                  </div>
                  <div class="meta" *ngIf="step.meta">{{ step.meta }}</div>
                  <div class="comment" *ngIf="step.comment">"{{ step.comment }}"</div>
                </div>
              </div>
            </div>

            <div class="sav-section">
              <div class="sav-sec-head">
                <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="8" r="3.5" />
                  <path d="M2 21c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
                  <path d="M16 5.5A3.5 3.5 0 0119 8M17 15.7c2.5.5 4 2.3 4 5.3" />
                </svg>
                <span class="st">Colaboradores</span>
                <span class="count">{{ colabCards().length }}</span>
                <div class="sav-stats" *ngIf="colabCards().length">
                  <span class="sav-stat ok">
                    <span class="d"></span>{{ enteredCount() }} entraram
                  </span>
                  <span class="sav-stat wait">
                    <span class="d"></span>{{ waitingCount() }} aguardando
                  </span>
                  <span class="sav-track">
                    <span class="fill" [style.width.%]="enteredPct()"></span>
                  </span>
                </div>
              </div>

              <div class="sav-toolbar" *ngIf="colabCards().length">
                <div class="sav-search">
                  <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4-4" />
                  </svg>
                  <input
                    [(ngModel)]="searchQuery"
                    (ngModelChange)="onSearchChange()"
                    placeholder="Buscar por nome, documento ou função…"
                  />
                </div>
                <div class="sav-seg">
                  <button type="button" [class.active]="colabFilter() === 'all'" (click)="setFilter('all')">
                    Todos
                  </button>
                  <button type="button" [class.active]="colabFilter() === 'in'" (click)="setFilter('in')">
                    Entraram
                  </button>
                  <button type="button" [class.active]="colabFilter() === 'wait'" (click)="setFilter('wait')">
                    Aguardando
                  </button>
                </div>
                <div class="sav-viewtog">
                  <button
                    type="button"
                    title="Agrupar por data"
                    [class.active]="colabView() === 'group'"
                    (click)="setView('group')"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="4" rx="1" />
                      <rect x="3" y="12" width="18" height="4" rx="1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Lista compacta"
                    [class.active]="colabView() === 'list'"
                    (click)="setView('list')"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div class="sav-empty" *ngIf="!colabCards().length">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="8" r="3.5" />
                  <path d="M2 21c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
                </svg>
                Nenhum colaborador neste acesso.
              </div>

              <div
                class="sav-empty"
                style="justify-content:center"
                *ngIf="colabCards().length && !filteredColabs().length"
              >
                Nenhum colaborador encontrado.
              </div>

              <ng-container *ngIf="colabView() === 'list' && filteredColabs().length">
                <div class="sav-grid list" style="margin-top:16px">
                  <div class="sav-cc" *ngFor="let p of filteredColabs()">
                    <img *ngIf="pictureUrl(p) as url" class="av" [src]="url" [alt]="p.name" />
                    <div *ngIf="!pictureUrl(p)" class="avph">{{ initials(p.name) }}</div>
                    <div class="main">
                      <div class="nm">{{ p.name }}</div>
                      <div class="mt">
                        {{ formatDoc(p.document) }}
                        <ng-container *ngIf="p.role"> · <b>{{ p.role }}</b></ng-container>
                      </div>
                    </div>
                    <div class="stt">
                      <ng-container *ngIf="p.status === 'wait'; else inChip">
                        <span class="sav-chip wait">Aguardando</span>
                        <div class="when" *ngIf="p.dayKey">
                          Última entrada {{ formatDateBr(p.dayKey) }}
                        </div>
                      </ng-container>
                      <ng-template #inChip>
                        <span class="sav-chip in"><span class="d"></span>{{ p.time }}</span>
                        <div class="when" *ngIf="p.dayKey">
                          {{ p.dayKey === todayKeyValue ? 'Hoje' : formatDateBr(p.dayKey) }}
                        </div>
                      </ng-template>
                    </div>
                  </div>
                </div>
              </ng-container>

              <ng-container *ngIf="colabView() === 'group'">
                <div class="sav-group" *ngFor="let g of colabGroups()">
                  <div class="sav-group-head" [class.wait]="g.isWaiting">
                    <span class="gdot"></span>
                    <span class="gd">{{ g.label }}</span>
                    <span class="today" *ngIf="g.isToday">Hoje</span>
                    <span class="gc">{{ g.count }}</span>
                    <span class="gl"></span>
                  </div>
                  <div class="sav-grid">
                    <div class="sav-cc" *ngFor="let p of g.items">
                      <img *ngIf="pictureUrl(p) as url" class="av" [src]="url" [alt]="p.name" />
                      <div *ngIf="!pictureUrl(p)" class="avph">{{ initials(p.name) }}</div>
                      <div class="main">
                        <div class="nm">{{ p.name }}</div>
                        <div class="mt">
                          {{ formatDoc(p.document) }}
                          <ng-container *ngIf="p.role"> · <b>{{ p.role }}</b></ng-container>
                        </div>
                      </div>
                      <div class="stt">
                        <ng-container *ngIf="p.status === 'wait'">
                          <span class="sav-chip wait">Aguardando</span>
                          <div class="when" *ngIf="p.dayKey">
                            Última entrada {{ formatDateBr(p.dayKey) }}
                          </div>
                        </ng-container>
                        <ng-container *ngIf="p.status === 'in'">
                          <span class="sav-chip in"><span class="d"></span>{{ p.time }}</span>
                          <div class="when" *ngIf="p.checkOut">
                            Saída {{ formatTimeBr(p.checkOut) }}
                          </div>
                        </ng-container>
                      </div>
                    </div>
                  </div>
                </div>
              </ng-container>
            </div>

            <div class="sav-section">
              <div class="sav-sec-head">
                <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path
                    d="M5 16l1.5-5A2 2 0 018.4 9.5h7.2a2 2 0 011.9 1.5L19 16M4 16h16v3H4z"
                  />
                </svg>
                <span class="st">Veículos</span>
                <span class="count">{{ svc.vehicles.length }}</span>
              </div>

              <div class="sav-empty" *ngIf="!svc.vehicles.length">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path
                    d="M5 16l1.5-5A2 2 0 018.4 9.5h7.2a2 2 0 011.9 1.5L19 16M4 16h16v3H4z"
                  />
                </svg>
                Nenhum veículo vinculado a este acesso.
              </div>

              <div class="sav-vc" *ngFor="let v of svc.vehicles">
                <div class="main" style="min-width:0;flex:1">
                  <div class="plate">{{ v.plate }}</div>
                  <div class="sub" *ngIf="vehicleSubtitle(v) as sub">{{ sub }}</div>
                </div>
                <div class="stt">
                  <span class="sav-chip wait" *ngIf="!v.check_in">Aguardando</span>
                  <ng-container *ngIf="v.check_in">
                    <span class="sav-chip in">
                      <span class="d"></span>{{ formatTimeBr(v.check_in) }}
                    </span>
                    <div class="when" style="font-size:10.5px;color:var(--sav-faint);margin-top:3px;text-align:right">
                      {{ formatDateBr(dateKey(v.check_in)) }}
                      <ng-container *ngIf="v.check_out">
                        · Saída {{ formatTimeBr(v.check_out) }}
                      </ng-container>
                    </div>
                  </ng-container>
                </div>
              </div>
            </div>

            <div class="sav-section">
              <div class="sav-sec-head">
                <svg class="sav-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                <span class="st">Histórico dos dias de acesso</span>
                <span class="count">{{ svc.access_history?.length || 0 }}</span>
              </div>

              <div class="sav-empty" *ngIf="!accessHistoryGroups().length">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Nenhum acesso registrado no histórico.
              </div>

              <div class="sav-group" *ngFor="let group of accessHistoryGroups()">
                <div class="sav-group-head">
                  <span class="gdot"></span>
                  <span class="gd">{{ group.label }}</span>
                  <span class="today" *ngIf="group.isToday">Hoje</span>
                  <span class="gc">{{ group.entries.length }}</span>
                  <span class="gl"></span>
                </div>

                <div class="sav-grid list">
                  <div class="sav-cc" *ngFor="let item of group.entries">
                    <div class="avph">
                      {{ item.kind === 'vehicle' ? 'V' : initials(item.subject_name) }}
                    </div>
                    <div class="main">
                      <div class="nm">{{ item.subject_name || '—' }}</div>
                      <div class="mt">
                        {{ item.kind === 'vehicle' ? 'Veículo' : 'Colaborador' }}
                        <ng-container *ngIf="item.subject_detail">
                          · <b>{{ item.subject_detail }}</b>
                        </ng-container>
                      </div>
                    </div>
                    <div class="stt">
                      <span class="sav-chip in">
                        <span class="d"></span>Entrada {{ formatTimeBr(item.check_in) }}
                      </span>
                      <div class="when" *ngIf="item.check_out">
                        Saída {{ formatTimeBr(item.check_out) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class ServiceAccessViewPageComponent implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly service = signal<ServiceAccessItem | null>(null);
  readonly approval = signal<ApprovalItem | null>(null);
  readonly error = signal<string | null>(null);
  readonly thumbnailUrls = signal<Record<number, string>>({});
  readonly inTeams = signal(false);
  readonly standaloneShell = signal(false);
  readonly colabFilter = signal<ColabFilter>('all');
  readonly colabView = signal<ColabView>('group');
  readonly searchTick = signal(0);

  searchQuery = '';
  readonly todayKeyValue = todayKey();

  formatDateBr = formatDateBr;
  formatDateTimeBr = formatDateTimeBr;
  formatTimeBr = formatTimeBr;
  formatDoc = formatDoc;
  initials = initials;
  dateKey = dateKey;

  private serviceId = 0;
  private lastSilentLoadAt = 0;
  private thumbnailLoadId = 0;

  readonly colabCards = computed(() => {
    const svc = this.service();
    if (!svc) return [] as ColabCard[];
    return (svc.collaborators || []).map((c) => this.toColabCard(c));
  });

  readonly enteredCount = computed(
    () => this.colabCards().filter((c) => c.status === 'in').length,
  );
  readonly waitingCount = computed(
    () => this.colabCards().filter((c) => c.status === 'wait').length,
  );
  readonly enteredPct = computed(() => {
    const total = this.colabCards().length;
    if (!total) return 0;
    return Math.round((this.enteredCount() / total) * 100);
  });

  readonly filteredColabs = computed(() => {
    this.searchTick();
    const q = this.searchQuery.trim().toLowerCase();
    const filter = this.colabFilter();
    return this.colabCards()
      .filter((p) => filter === 'all' || p.status === filter)
      .filter(
        (p) =>
          !q ||
          `${p.name} ${p.document} ${p.role}`.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const ak = `${a.dayKey || '0'}${a.time || ''}`;
        const bk = `${b.dayKey || '0'}${b.time || ''}`;
        return bk.localeCompare(ak);
      });
  });

  readonly colabGroups = computed(() => {
    const list = this.filteredColabs();
    if (this.colabView() !== 'group') return [] as ColabGroup[];

    const entered = list.filter((p) => p.status === 'in');
    const waiting = list.filter((p) => p.status === 'wait');
    const dates = [
      ...new Set(entered.map((p) => p.dayKey).filter((d): d is string => !!d)),
    ].sort((a, b) => b.localeCompare(a));

    const groups: ColabGroup[] = dates.map((d) => {
      const items = entered
        .filter((p) => p.dayKey === d)
        .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
      return {
        key: d,
        label: formatLongDateBr(d),
        isToday: d === this.todayKeyValue,
        isWaiting: false,
        count: items.length,
        items,
      };
    });

    if (waiting.length) {
      groups.push({
        key: 'waiting',
        label: 'Aguardando entrada',
        isToday: false,
        isWaiting: true,
        count: waiting.length,
        items: waiting,
      });
    }
    return groups;
  });

  readonly accessHistoryGroups = computed(() => {
    const history = this.service()?.access_history || [];
    const byDay = new Map<string, ServiceAccessHistoryItem[]>();
    for (const item of history) {
      const key = dateKey(item.access_date || item.check_in);
      if (!key) continue;
      const entries = byDay.get(key) || [];
      entries.push(item);
      byDay.set(key, entries);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, entries]) => ({
        key,
        label: formatLongDateBr(key),
        isToday: key === this.todayKeyValue,
        entries: entries.sort((a, b) =>
          String(b.check_in).localeCompare(String(a.check_in)),
        ),
      }));
  });

  readonly approvalTrail = computed(() => {
    const ap = this.approval();
    if (!ap) return [] as Array<{
      tone: 'create' | 'ok' | 'reject';
      level?: string;
      title: string;
      decision?: string;
      meta?: string;
      comment?: string | null;
    }>;

    const steps: Array<{
      tone: 'create' | 'ok' | 'reject';
      level?: string;
      title: string;
      decision?: string;
      meta?: string;
      comment?: string | null;
    }> = [];

    const create = (ap.historico || []).find((h) => h.tipo === 'CRIACAO');
    if (create) {
      steps.push({
        tone: 'create',
        title: create.titulo || 'Solicitação criada',
        meta: [create.usuario?.nome, formatDateTimeBr(create.data)]
          .filter(Boolean)
          .join(' · '),
      });
    } else {
      steps.push({
        tone: 'create',
        title: 'Solicitação criada',
        meta: [ap.solicitante?.nome, formatDateTimeBr(ap.criadoEm)]
          .filter(Boolean)
          .join(' · '),
      });
    }

    for (const d of ap.decisoes || []) {
      const ok = d.decisao === 'APROVADO';
      steps.push({
        tone: ok ? 'ok' : 'reject',
        level: `Nível ${d.nivel}`,
        title: d.usuario?.nome || 'Aprovador',
        decision: ok ? 'Aprovado' : 'Reprovado',
        meta: [ap.setor?.nome, formatDateTimeBr(d.decididoEm)].filter(Boolean).join(' · '),
        comment: d.comentario,
      });
    }

    if (!(ap.decisoes || []).length) {
      for (const h of (ap.historico || []).filter((x) => x.tipo !== 'CRIACAO')) {
        steps.push(this.historyToStep(h));
      }
    }

    return steps;
  });

  constructor(
    private route: ActivatedRoute,
    private patrimonialService: PatrimonialService,
    private collaboratorService: CollaboratorService,
    private approvalService: ApprovalService,
    private notification: NotificationService,
    private teamsContext: TeamsContextService,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'visible' && this.serviceId) {
      this.carregar({ silent: true });
    }
  }

  async ngOnInit() {
    const inTeams = await this.teamsContext.ensureInitialized();
    this.inTeams.set(inTeams);
    this.standaloneShell.set(inTeams || !document.querySelector('app-main-layout'));

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.error.set('Acesso de serviço inválido.');
      this.loading.set(false);
      return;
    }
    this.serviceId = id;
    this.carregar();
  }

  ngOnDestroy() {
    this.revokeThumbnails();
  }

  onSearchChange() {
    this.searchTick.update((n) => n + 1);
  }

  setFilter(filter: ColabFilter) {
    this.colabFilter.set(filter);
  }

  setView(view: ColabView) {
    this.colabView.set(view);
  }

  carregar(options: { silent?: boolean } = {}) {
    if (options.silent) {
      const now = Date.now();
      if (now - this.lastSilentLoadAt < 2500) return;
      this.lastSilentLoadAt = now;
    } else {
      this.loading.set(true);
    }
    this.error.set(null);
    this.patrimonialService.getById(this.serviceId).subscribe({
      next: (res) => {
        this.service.set(res.service);
        this.loadThumbnails(res.service.collaborators || []);
        this.loadApproval(res.service.id_aprovacao);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        if (!options.silent) {
          this.error.set(
            this.notification.extractErrorMessage(
              err,
              'Não foi possível carregar o acesso de serviço.',
            ),
          );
        }
        this.cdr.markForCheck();
      },
    });
  }

  pictureUrl(p: ColabCard): string | null {
    return this.thumbnailUrls()[p.id] ?? null;
  }

  vehicleSubtitle(v: ServiceAccessVehicle): string | null {
    const parts = [v.brand, v.model, v.color].map((x) => String(x || '').trim()).filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  statusHeadClass(idAccessStatus: number): string {
    if (idAccessStatus === 4) return 'is-danger';
    if (idAccessStatus === 1 || idAccessStatus === 2) return 'is-warn';
    return '';
  }

  statusBadgeTone(idAccessStatus: number): string {
    if (idAccessStatus === 4) return 'is-danger';
    if (idAccessStatus === 1 || idAccessStatus === 2) return 'is-warn';
    return '';
  }

  statusSubtitle(svc: ServiceAccessItem): string {
    if (svc.id_access_status === 3) return 'Solicitação aprovada e liberada para acesso';
    if (svc.id_access_status === 4) return 'Solicitação reprovada';
    if (svc.id_access_status === 2) return 'Aguardando decisão dos aprovadores';
    return 'Rascunho / em preparação';
  }

  private toColabCard(c: ServiceAccessCollaborator): ColabCard {
    const checkIn = c.access_check_in;
    const day = checkIn ? dateKey(checkIn) : null;
    const enteredToday = !!day && day === this.todayKeyValue;
    return {
      id: c.id_collaborator,
      name: c.collaborator_name,
      document: c.collaborator_document,
      role: c.role_description || '',
      picture: c.collaborator_picture || null,
      status: enteredToday ? 'in' : 'wait',
      dayKey: day,
      time: checkIn ? formatTimeBr(checkIn) : null,
      checkOut: c.access_check_out,
    };
  }

  private historyToStep(h: ApprovalHistoryItem) {
    const reject = h.tipo === 'REPROVACAO' || h.tipo === 'CANCELAMENTO';
    const ok = h.tipo === 'APROVACAO';
    return {
      tone: (ok ? 'ok' : reject ? 'reject' : 'create') as 'create' | 'ok' | 'reject',
      title: h.titulo,
      meta: [h.usuario?.nome, formatDateTimeBr(h.data)].filter(Boolean).join(' · '),
      comment: h.detalhe || null,
    };
  }

  private loadApproval(idAprovacao: number | null | undefined) {
    if (!idAprovacao) {
      this.approval.set(null);
      return;
    }
    this.approvalService.get(idAprovacao).subscribe({
      next: (res) => {
        this.approval.set(res.approval);
        this.cdr.markForCheck();
      },
      error: () => {
        this.approval.set(null);
        this.cdr.markForCheck();
      },
    });
  }

  private loadThumbnails(list: ServiceAccessCollaborator[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.collaborator_picture) continue;
      this.collaboratorService.getPictureBlob(c.collaborator_picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [c.id_collaborator]: url }));
          this.cdr.markForCheck();
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    for (const url of Object.values(this.thumbnailUrls())) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.set({});
  }
}
