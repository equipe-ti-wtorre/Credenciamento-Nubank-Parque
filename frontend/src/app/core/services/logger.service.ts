import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  debug(message: string, context?: Record<string, unknown>) {
    if (!environment.production) {
      console.debug(`[Credenciamento] ${message}`, context ?? '');
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    console.info(`[Credenciamento] ${message}`, context ?? '');
  }

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(`[Credenciamento] ${message}`, context ?? '');
  }

  error(message: string, context?: Record<string, unknown>) {
    console.error(`[Credenciamento] ${message}`, context ?? '');
  }
}
