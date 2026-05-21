import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import Swal, { type SweetAlertIcon } from 'sweetalert2';

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
  success(title: string, text?: string) {
    return this.fire('success', title, text);
  }

  error(title: string, text?: string) {
    return this.fire('error', title, text);
  }

  warning(title: string, text?: string) {
    return this.fire('warning', title, text);
  }

  info(title: string, text?: string) {
    return this.fire('info', title, text);
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
    return fallback;
  }

  private fire(icon: SweetAlertIcon, title: string, text?: string) {
    return Toast.fire({
      icon,
      title,
      ...(text ? { text } : {}),
    });
  }
}
