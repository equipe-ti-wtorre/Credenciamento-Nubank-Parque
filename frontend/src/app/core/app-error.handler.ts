import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { LoggerService } from './services/logger.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private listenersBound = false;

  constructor(private injector: Injector) {
    this.bindWindowListeners();
  }

  handleError(error: unknown): void {
    const err = this.asError(error);
    this.logger().error(err.message || 'Erro não tratado no cliente', {
      stack: err.stack,
      path: typeof location !== 'undefined' ? `${location.pathname}${location.search}` : undefined,
      source: 'angular',
    });
  }

  private bindWindowListeners() {
    if (this.listenersBound || typeof window === 'undefined') return;
    this.listenersBound = true;

    window.addEventListener('unhandledrejection', (event) => {
      const err = this.asError(event.reason);
      this.logger().error(err.message || 'Promise rejeitada sem tratamento', {
        stack: err.stack,
        path: typeof location !== 'undefined' ? `${location.pathname}${location.search}` : undefined,
        source: 'unhandledrejection',
      });
    });
  }

  private logger(): LoggerService {
    return this.injector.get(LoggerService);
  }

  private asError(value: unknown): Error {
    if (value instanceof Error) return value;
    if (typeof value === 'string') return new Error(value);
    if (value && typeof value === 'object' && 'message' in value) {
      return new Error(String((value as { message: unknown }).message));
    }
    return new Error(String(value ?? 'Erro desconhecido'));
  }
}
