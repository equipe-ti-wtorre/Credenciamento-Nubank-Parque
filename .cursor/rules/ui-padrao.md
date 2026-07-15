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

```html
<app-action-menu>
  <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(item)" />
  <app-action-dropdown>
    <button appActionDropdownItem (click)="toggleAtivo(item)">...</button>
    <hr class="action-dropdown__divider" />
    <button appActionDropdownItem [danger]="true" (click)="excluir(item)">Excluir</button>
  </app-action-dropdown>
</app-action-menu>
```

**Exceção:** listas simples **dentro de modais** (ex.: gerenciar funções) mantêm botões visíveis, sem kebab.

**Acessibilidade:** `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`/`menuitem`, foco no primeiro item ao abrir, Esc e clique fora fecham.

**Anti-patterns:** múltiplos `action-btn` coloridos lado a lado; `variant="success"` (verde proibido).

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

## Referência end-to-end

[`collaborator-list.component.ts`](../frontend/src/app/pages/admin/collaborators/collaborator-list.component.ts) — modal + kebab + `btn-action-*` + `form-*`.

## Anti-patterns explícitos

- Modais inline `fixed inset-0 z-50` sem `<app-modal>`
- `.btn-primary` verde ou `.btn-secondary` índigo como hierarquia semântica
- Mais de um botão colorido no mesmo footer/bloco
- Links `text-emerald-600` / `text-rose-600` como ações de tabela
- Fontes hardcoded — usar `--font-display` / `--font-body`
