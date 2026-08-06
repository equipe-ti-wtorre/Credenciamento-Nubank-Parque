import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import {
  DocumentChangeRequest,
  DocumentChangeService,
} from '../../../services/document-change.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-document-approvals',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full max-w-4xl">
      <h2 class="page-section-title">Aprovações de documento</h2>
      <p class="page-section-subtitle mb-5">Solicitações pendentes de correção de CPF/documento.</p>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Colaborador</th>
              <th class="px-4 py-3 text-left">De → Para</th>
              <th class="px-4 py-3 text-left">Motivo</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of requests()" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ r.collaborator_name }}</td>
              <td class="px-4 py-3 font-mono text-xs">
                {{ r.old_document }} → {{ r.new_document }}
              </td>
              <td class="px-4 py-3 text-slate-600">{{ r.reason }}</td>
              <td class="px-4 py-3 text-right space-x-2">
                <button type="button" class="btn-action-primary text-xs py-1.5 px-3" (click)="aprovar(r)">
                  Aprovar solicitação
                </button>
                <button type="button" class="btn-action-secondary text-xs py-1.5 px-3" (click)="rejeitar(r)">
                  Rejeitar solicitação
                </button>
              </td>
            </tr>
            <tr *ngIf="!loading() && requests().length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-slate-500">Nenhuma pendência.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class DocumentApprovalsComponent implements OnInit {
  requests = signal<DocumentChangeRequest[]>([]);
  loading = signal(false);

  constructor(
    private documentChangeService: DocumentChangeService,
    private notification: NotificationService,
  ) {}

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.loading.set(true);
    this.documentChangeService.listPending().subscribe({
      next: (res) => {
        this.requests.set(res.requests);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar pendências.');
      },
    });
  }

  aprovar(r: DocumentChangeRequest) {
    Swal.fire({
      title: 'Aprovar alteração?',
      text: `Atualizar documento de ${r.collaborator_name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aprovar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.documentChangeService.patchStatus(r.id, { status: 'APPROVED' }).subscribe({
        next: () => {
          this.notification.success('Solicitação aprovada.');
          this.carregar();
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao aprovar.'),
      });
    });
  }

  rejeitar(r: DocumentChangeRequest) {
    Swal.fire({
      title: 'Rejeitar solicitação',
      input: 'textarea',
      inputLabel: 'Motivo (opcional)',
      showCancelButton: true,
      confirmButtonText: 'Rejeitar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.documentChangeService
        .patchStatus(r.id, { status: 'REJECTED', admin_reason: result.value || undefined })
        .subscribe({
          next: () => {
            this.notification.success('Solicitação rejeitada.');
            this.carregar();
          },
          error: (err) => this.notification.notifyHttpError(err, 'Falha ao rejeitar.'),
        });
    });
  }
}
