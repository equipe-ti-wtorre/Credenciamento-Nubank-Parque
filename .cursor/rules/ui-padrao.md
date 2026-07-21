# Padrão UI — Intranet WTorre

Aplica-se a `frontend/src/**/*.{ts,scss,html}` ao criar ou alterar telas, modais, menus de ação e formulários.

## Tokens (fonte única)

Definidos em [`frontend/src/styles/_tokens.scss`](../frontend/src/styles/_tokens.scss). **Sempre referenciar tokens**, nunca valores hardcoded:

| Token | Uso |
|-------|-----|
| `--wtorre`, `--wtorre-hover`, `--wtorre-tonal-bg` | Cor de marca |
| `--danger`, `--danger-soft-bg`, `--danger-border` | Ações destrutivas |
| `--font-display` | Títulos (Sora) |
| `--font-body` | Corpo (Plus Jakarta Sans) |
| `--form-field-height`, `--form-radius` | Campos (~42px, rounded-xl) |
| `--app-border`, `--text-muted` | Bordas e texto secundário |

Componentes em [`frontend/src/styles/_components.scss`](../frontend/src/styles/_components.scss).

---

## A) Hierarquia de botões

**Regra única para todo o projeto.** No máximo **um botão colorido** por contexto.

| Tipo | Classe | Quando usar |
|------|--------|-------------|
| Primária | `btn-action-primary` | Salvar, Enviar, Adicionar, Confirmar — sólido `--wtorre`, texto branco |
| Secundária | `btn-action-secondary` | Cancelar, Fechar, Voltar — fundo branco, borda cinza, texto cinza escuro. **Nunca colorida** |
| Tonal | `btn-action-tonal` | Apoio (ex.: baixar template) — fundo `--wtorre-tonal-bg`, texto `--wtorre` |
| Destrutiva | `btn-action-danger` ou item `[danger]` no dropdown | Excluir/remover — vermelho, reservada só para ações irreversíveis |

**Regras:**
- Eliminar botões verdes soltos e pares roxo+verde competindo.
- `disabled` = visual cinza real + atributo `disabled`, nunca só opacidade.
- Rótulos descritivos: **"Salvar colaborador"**, não só "Salvar".
- Classes legacy `.btn-primary`, `.btn-secondary`, `.btn-primary-blue` são aliases temporários — preferir `btn-action-*` em código novo.

---

## B) Modal base

Usar [`<app-modal>`](../frontend/src/app/shared/modal/modal.component.ts). **Não** criar overlays inline `fixed inset-0`.

```html
<app-modal
  [open]="showModal()"
  title="Editar colaborador"
  subtitle="Opcional: descrição"
  size="md"
  (close)="fecharModal()"
>
  <!-- corpo -->
  <div modal-footer class="modal-footer">
    <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
    <button type="submit" class="btn-action-primary" [disabled]="form.invalid">Salvar colaborador</button>
  </div>
</app-modal>
```

**Footer:** secundária à esquerda da primária, alinhadas à direita, separação visual (`modal-footer`).

**Tamanhos:** `sm` | `md` | `lg` | `xl`

**Acessibilidade (já no componente):** `role="dialog"`, `aria-modal`, `aria-labelledby`, foco no primeiro campo, Esc fecha, focus trap, `prefers-reduced-motion`.

**Confirmações destrutivas:** SweetAlert2 via `NotificationService` — fora do escopo de `<app-modal>`.

---

## C) Menu de ações (kebab)

Componentes em [`frontend/src/app/shared/actions/`](../frontend/src/app/shared/actions/):

- `app-action-menu` — container
- `app-action-btn` — botão de ícone (variante `neutral` para Editar)
- `app-action-dropdown` + `button[appActionDropdownItem]` — menu ⋮

**Padrão em linha de tabela:**
1. Ação mais frequente (**Editar**) como botão direto (`variant="neutral"`)
2. Demais ações no kebab (ativar/desativar, blacklist, etc.)
3. **Excluir** sempre por último, vermelho (`[danger]="true"`), após `<hr class="action-dropdown__divider" />`

### Ícones obrigatórios no dropdown

Todo `button[appActionDropdownItem]` **deve** ter um SVG à esquerda do rótulo, com estes atributos:

```html
<svg
  class="action-dropdown__item-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- paths canônicos abaixo -->
</svg>
```

**Catálogo canônico (reutilizar paths; não inventar ícones novos para estas ações):**

| Ação | Paths |
|------|--------|
| Ativar / Desativar / Habilitar / Desabilitar | `<path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><path d="M12 2v10" />` (power) |
| Excluir / Desvincular | trash: `M3 6h18` + corpo da lixeira + `M10 11v6` + `M14 11v6` (ver referência) |
| Blacklist | shield `M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z` + X (adicionar) ou check (remover) |
| Reenviar convite / e-mail | envelope: `M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z` + `m22 6-10 7L2 6` |

**Cor / danger:**
- Ativar/Desativar e ações secundárias = **neutro** (sem `[danger]`)
- Só Excluir / remoção irreversível usa `[danger]="true"`

```html
<app-action-menu>
  <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(item)" />
  <app-action-dropdown>
    <button appActionDropdownItem type="button" (click)="toggleAtivo(item)">
      <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
        <path d="M12 2v10" />
      </svg>
      {{ item.ativo ? 'Desativar' : 'Ativar' }}
    </button>
    <hr class="action-dropdown__divider" />
    <button appActionDropdownItem type="button" [danger]="true" (click)="excluir(item)">
      <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
      Excluir
    </button>
  </app-action-dropdown>
</app-action-menu>
```

**Referência end-to-end do kebab:** [`collaborator-list.component.ts`](../frontend/src/app/pages/admin/collaborators/collaborator-list.component.ts).

**Exceção:** listas simples **dentro de modais** (ex.: gerenciar funções) mantêm botões visíveis, sem kebab.

**Acessibilidade:** `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`/`menuitem`, foco no primeiro item ao abrir, Esc e clique fora fecham.

**Anti-patterns:**
- Item de menu só com texto (sem `action-dropdown__item-icon`)
- Desativar/Ativar com `[danger]="true"` (vermelho reservado a Excluir)
- Múltiplos `action-btn` coloridos lado a lado; `variant="success"` (verde proibido)
- Ícones de biblioteca (Heroicons/Material) diferentes do stroke 1.75 / viewBox 24 neste menu

---

## D) Campos de formulário

Classes reutilizáveis (não Tailwind ad hoc):

```html
<label class="form-label">
  Nome <span class="form-label__optional">(opcional)</span>
</label>
<input class="form-field" type="text" />
<select class="form-select">...</select>
<textarea class="form-field" rows="3"></textarea>
```

- Label: maiúsculas pequenas (`form-label`)
- Altura consistente (`--form-field-height`)
- Foco: borda `--wtorre` + halo `--wtorre-focus-ring`
- Select: seta customizada via `form-select`
- Opcionais: `(opcional)` em `form-label__optional`

Upload: `upload-dropzone` e variantes `--dragover`, `--selected`.

---

## E) Filtros de listagem (digitar já filtra)

Em barras de filtro de tabelas/listas:

1. **Texto** (`input` search/nome/placa/etc.): filtrar ao digitar com **debounce 350ms** — `(ngModelChange)="onTextFilterChange()"` que agenda `aplicarFiltros()`.
2. **Select / date / checkbox**: filtrar **imediatamente** no `(ngModelChange)="aplicarFiltros()"`.
3. **Não** usar botão **Filtrar**. Manter só **Limpar** (quando fizer sentido).
4. Referência: [`company-list.component.ts`](../frontend/src/app/pages/admin/companies/company-list.component.ts) / [`collaborator-list.component.ts`](../frontend/src/app/pages/admin/collaborators/collaborator-list.component.ts).

```ts
private readonly filterDebounceMs = 350;
private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

onTextFilterChange() {
  if (this.filterDebounceTimer !== null) clearTimeout(this.filterDebounceTimer);
  this.filterDebounceTimer = setTimeout(() => this.aplicarFiltros(), this.filterDebounceMs);
}
```

**Anti-patterns:** botão “Filtrar”; texto que só filtra após Enter/clique; debounce ausente em campos de texto com API.

---

## Referência end-to-end

[`collaborator-list.component.ts`](../frontend/src/app/pages/admin/collaborators/collaborator-list.component.ts) — modal + kebab + `btn-action-*` + `form-*` + filtros live.

## Anti-patterns explícitos

- Modais inline `fixed inset-0 z-50` sem `<app-modal>`
- `.btn-primary` verde ou `.btn-secondary` índigo como hierarquia semântica
- Mais de um botão colorido no mesmo footer/bloco
- Links `text-emerald-600` / `text-rose-600` como ações de tabela
- Fontes hardcoded — usar `--font-display` / `--font-body`
- `appActionDropdownItem` sem ícone SVG `action-dropdown__item-icon`
- Botão **Filtrar** em barras de filtro de lista (usar digitar-já-filtra)
