import { Injectable, Injector } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import Swal, { type SweetAlertIcon, type SweetAlertResult } from 'sweetalert2';
import { AuthService } from './auth.service';

export type ServiceOverlapConflictDetails = {
  collaborator_name?: string;
  id_collaborator?: number;
  conflict_label?: string | null;
  conflict_start_date?: string | null;
  conflict_end_date?: string | null;
  conflict_id_service_access?: number;
  conflicts?: ServiceOverlapConflictDetails[];
};

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 4000,
  timerProgressBar: true,
  customClass: {
    popup: 'app-toast',
  },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private injector: Injector) {}

  success(title: string, text?: string) {
    return this.fire('success', title, text);
  }

  error(title: string, text?: string, err?: unknown) {
    if (!this.shouldNotifyHttpError(err)) {
      return Promise.resolve();
    }
    if (this.isServiceCollaboratorOverlap(err)) {
      return this.showServiceCollaboratorOverlap(err);
    }
    return this.fire('error', title, text);
  }

  warning(title: string, text?: string) {
    return this.fire('warning', title, text);
  }

  info(title: string, text?: string) {
    return this.fire('info', title, text);
  }

  shouldNotifyHttpError(err: unknown): boolean {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      return false;
    }
    try {
      if (this.injector.get(AuthService).isLoggingOut()) {
        return false;
      }
    } catch {
      /* AuthService indisponível */
    }
    return true;
  }

  notifyHttpError(
    err: unknown,
    fallback: string,
    text?: string,
  ): Promise<SweetAlertResult | void> {
    if (!this.shouldNotifyHttpError(err)) {
      return Promise.resolve();
    }
    if (this.isServiceCollaboratorOverlap(err)) {
      return this.showServiceCollaboratorOverlap(err);
    }
    return this.error(this.extractErrorMessage(err, fallback), text, err);
  }

  extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object' && 'message' in body) {
        const msg = (body as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) return msg;
      }
    }
    if (err instanceof Error && err.message.trim()) return err.message;
    return fallback;
  }

  isServiceCollaboratorOverlap(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse) || err.status !== 409) return false;
    const body = err.error;
    if (!body || typeof body !== 'object') return false;
    if ((body as { code?: string }).code === 'SERVICE_COLLABORATOR_DATE_OVERLAP') {
      return true;
    }
    const msg = String((body as { message?: string }).message || '');
    return /data sobreposta/i.test(msg);
  }

  getServiceOverlapDetails(err: unknown): ServiceOverlapConflictDetails | null {
    if (!(err instanceof HttpErrorResponse) || !err.error || typeof err.error !== 'object') {
      return null;
    }
    const details = (err.error as { details?: ServiceOverlapConflictDetails }).details;
    return details && typeof details === 'object' ? details : null;
  }

  private showServiceCollaboratorOverlap(err: unknown): Promise<SweetAlertResult> {
    const body =
      err instanceof HttpErrorResponse && err.error && typeof err.error === 'object'
        ? (err.error as {
            message?: string;
            details?: ServiceOverlapConflictDetails;
          })
        : null;
    const details = body?.details;
    const items =
      Array.isArray(details?.conflicts) && details!.conflicts!.length > 0
        ? details!.conflicts!
        : details
          ? [details]
          : [];

    const canRemove = items.length === 1 && Number(items[0]?.id_collaborator) > 0;

    const rowsHtml = items
      .map((item) => {
        const name = this.escapeHtml(item.collaborator_name?.trim() || 'Colaborador');
        const conflict = this.escapeHtml(item.conflict_label?.trim() || '');
        const start = this.formatDateBr(item.conflict_start_date);
        const end = this.formatDateBr(item.conflict_end_date);
        const period =
          start && end ? (start === end ? start : `${start} — ${end}`) : '';
        const safePeriod = this.escapeHtml(period);
        return `
          <li style="margin:0 0 10px;padding:0;list-style:none;text-align:left">
            <p style="margin:0 0 4px;font-size:15px;line-height:1.45;color:#334155">
              <strong style="color:#0f172a">${name}</strong>
              já está cadastrado em outro acesso de serviço com data sobreposta.
            </p>
            ${
              conflict
                ? `<p style="margin:0;font-size:14px;line-height:1.4;color:#475569"><strong>Conflito:</strong> ${conflict}${
                    period ? ` <span style="color:#64748b">(${safePeriod})</span>` : ''
                  }</p>`
                : ''
            }
          </li>`;
      })
      .join('');

    const fallbackMsg = this.escapeHtml(
      body?.message ||
        'Colaborador já está cadastrado em outro acesso de serviço com data sobreposta.',
    );

    const html =
      items.length > 0
        ? `
        <p style="margin:0 0 12px;font-size:14px;line-height:1.4;color:#64748b;text-align:left">
          ${items.length === 1 ? '1 colaborador com conflito de período:' : `${items.length} colaboradores com conflito de período:`}
        </p>
        <ul style="margin:0;padding:0;max-height:280px;overflow:auto">${rowsHtml}</ul>
      `
        : `<p style="margin:0;font-size:15px;line-height:1.45;color:#334155;text-align:left">${fallbackMsg}</p>`;

    return Swal.fire({
      icon: 'warning',
      title: 'Conflito de período',
      html,
      showCancelButton: true,
      showDenyButton: canRemove,
      focusConfirm: true,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#1d54e6',
      denyButtonText: 'Remover',
      denyButtonColor: '#d93025',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
  }

  private formatDateBr(value: string | null | undefined): string {
    if (!value) return '';
    const d = String(value).slice(0, 10);
    const [y, m, day] = d.split('-');
    if (!y || !m || !day) return d;
    return `${day}/${m}/${y}`;
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private fire(icon: SweetAlertIcon, title: string, text?: string) {
    return Toast.fire({
      icon,
      title,
      ...(text ? { text } : {}),
    });
  }
}
