# Inventário de desvios UI — Intranet WTorre

Gerado na Fase 2 do plano de padronização. Referência: [`.cursor/rules/ui-padrao.md`](../.cursor/rules/ui-padrao.md).

## Modais inline → migrar para `<app-modal>`

| Arquivo | Qtd | Desvio |
|---------|-----|--------|
| `sector-list.component.ts` | 1 | Inline, sem ARIA/focus trap |
| `product-list.component.ts` | 1 | Idem |
| `storage-location-list.component.ts` | 1 | Idem |
| `service-request-list.component.ts` | 1 | Idem |
| `vehicle-list.component.ts` | 1 | Inline + `btn-primary-blue` |
| `service-access-detail.component.ts` | 3 | Inline repetido |
| `approvals-inbox.component.ts` | 1 | Inline; par de botões coloridos |
| `event-list.component.ts` | 1 | Inline `max-w-3xl` |
| `event-detail.component.ts` | 1 | Inline |
| `user-list.component.ts` | 1 | Inline |
| `teams-integration.component.ts` | 1 | Inline |
| `tenant-list.component.ts` | 1 | Inline |
| `company-list.component.ts` | 1 | Inline `max-w-3xl` |
| `gate-control.component.ts` | 1 modal | Modal substituto migrar; overlays fullscreen manter |

**Fora do escopo:** SweetAlert2 (~11 arquivos) — confirmações destrutivas.

## Colunas "Ações" → Editar + kebab

| Arquivo | Padrão atual | Ação |
|---------|--------------|------|
| `collaborator-list` | Editar + kebab | Referência |
| `vehicle-list` | Editar + kebab | Referência |
| `user-list` | Editar + delete | → kebab |
| `company-list` | 3 ícones | → kebab |
| `product-list` | 3 ícones | → kebab |
| `storage-location-list` | 3 ícones | → kebab |
| `teams-integration` | 3 ícones | → kebab |
| `tenant-list` | 4 ícones | → kebab |
| `sector-list` | 2× btn-secondary | → action-menu + kebab |
| `service-request-list` | 2× btn-secondary | → kebab |
| `event-list` | 1× "Configurar" | Manter botão único tonal |
| `document-approvals` | Verde + índigo | Primária + secundária neutra |
| `event-detail` | Links emerald/rose | action-btn / btn-action |
| `service-access-detail` | Link rose | Manter em modal (exceção) |
| `gate-control` | Cores semânticas | Manter (operacional) |

## Botões fora da hierarquia

- `styles.scss` — aliases legacy redirecionados para `btn-action-*`
- `approvals-inbox`, `document-approvals` — pares coloridos
- `collaborator-list`, `vehicle-list` — `btn-primary-blue` → `btn-action-primary`
- ~18 páginas com `btn-primary`/`btn-secondary` — migrar rótulos e classes

## Decisões aplicadas na migração

1. **gate-control:** manter cores semânticas operacionais
2. **document-approvals / approvals-inbox:** aprovar = primária; rejeitar = secundária neutra
3. **event-list:** botão único `btn-action-tonal` "Configurar"
4. **SweetAlert2:** manter estilo padrão Swal
