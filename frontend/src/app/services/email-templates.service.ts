import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface EmailTemplateVariable {
  key: string;
  label: string;
}

export interface EmailTemplateSummary {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  assunto: string;
  ativo: boolean;
  updated_at: string;
  updated_by: number | null;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  corpo_html: string;
  corpo_texto: string | null;
  variables: EmailTemplateVariable[];
  sample_vars: Record<string, string>;
}

export interface EmailTemplateUpdatePayload {
  nome: string;
  descricao?: string | null;
  assunto: string;
  corpo_html: string;
  corpo_texto?: string | null;
  ativo: boolean;
}

export interface EmailTemplatePreview {
  subject: string;
  html: string;
  text: string | null;
}

@Injectable({ providedIn: 'root' })
export class EmailTemplatesService {
  constructor(private api: ApiService) {}

  list(): Observable<{ templates: EmailTemplateSummary[] }> {
    return this.api.get<{ templates: EmailTemplateSummary[] }>('/email-templates');
  }

  getByCodigo(codigo: string): Observable<{ template: EmailTemplateDetail }> {
    return this.api.get<{ template: EmailTemplateDetail }>(`/email-templates/${codigo}`);
  }

  update(
    codigo: string,
    data: EmailTemplateUpdatePayload,
  ): Observable<{ template: EmailTemplateDetail }> {
    return this.api.put<{ template: EmailTemplateDetail }>(`/email-templates/${codigo}`, data);
  }

  preview(
    codigo: string,
    body: Partial<Pick<EmailTemplateUpdatePayload, 'assunto' | 'corpo_html' | 'corpo_texto'>> & {
      vars?: Record<string, string>;
    } = {},
  ): Observable<{ preview: EmailTemplatePreview; vars: Record<string, string> }> {
    return this.api.post(`/email-templates/${codigo}/preview`, body);
  }

  testSend(
    codigo: string,
    body: {
      destinatario: string;
      assunto?: string;
      corpo_html?: string;
      corpo_texto?: string | null;
      vars?: Record<string, string>;
    },
  ): Observable<{ message: string; provider?: string; messageId?: string | null }> {
    return this.api.post(`/email-templates/${codigo}/test`, body);
  }
}
