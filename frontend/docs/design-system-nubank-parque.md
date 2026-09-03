# Design system — Nubank Parque

Guia canônico da paleta `nubank-parque` no Credenciamento. Consolida identidade, tokens, tipografia, componentes e regras que já existem no código.

Tabela de tokens (WTorre + Nubank): [cores.md](./cores.md).  
Fonte de verdade no CSS: [`frontend/src/styles/_tokens.scss`](../src/styles/_tokens.scss).

Este documento **não inventa tokens**. Tudo abaixo já está implementado.

---

## 1. Identidade e princípios

### Paleta oficial

O sistema tem exatamente duas paletas. É proibido inventar uma terceira.

| `html[data-theme]` | Paleta |
|--------------------|--------|
| `wtorre` (padrão) | Azul institucional WTorre |
| `nubank-parque` | Core Purple Nubank Parque + herança verde |

A escolha é global (vale para todos os usuários) em **Configurações → Aparência**. Tipo TypeScript: `ColorPalette = 'wtorre' | 'nubank-parque'`.

### Como o tema entra em vigor

```
Admin escolhe paleta → PUT /system-settings/appearance
                     → ThemeService.apply('nubank-parque')
                     → html[data-theme="nubank-parque"]
                     → tokens em _tokens.scss resolvem para roxo/verde
```

- `ThemeService` (`frontend/src/app/core/services/theme.service.ts`) aplica `data-theme` no `<html>`.
- Cache síncrono em `localStorage` (`app.color_palette`) no boot — anti-FOUC via `APP_INITIALIZER`.
- Após o login, sincroniza com `GET /system-settings/appearance`.
- Componentes genéricos usam `var(--brand)` / `var(--wtorre*)` e mudam sozinhos. Não há ThemeProvider por componente.

### Princípios

1. **Sempre `var(--token)`** — nunca hex de marca (`#8d0de3`, `#820AD1`, verdes) em telas.
2. **Um botão colorido por contexto** (footer, barra, bloco).
3. **Verde = status / sucesso** (`--success*`, `--menu-status`) — não rivaliza com o CTA roxo.
4. **`--purple-1000` / `--premium` nunca no menu** — reservado a áreas Premium.
5. **Telas genéricas usam `--brand*`** — tokens `--core-purple` / `--purple-*` / `--green-*` só em login/auth ou quando o design exigir tinta/premium.
6. **Não redefinir `--brand` em `:host`** nem misturar azul WTorre hardcoded com o tema Nubank.
7. Alterar paleta: editar `_tokens.scss` e/ou Aparência — nunca CSS ad hoc por página.

### Contraste rápido (WTorre vs Nubank)

| Papel | WTorre | Nubank Parque |
|-------|--------|---------------|
| Marca / CTA | `#1d54e6` | `#8d0de3` |
| Hover | `#1442ba` | `#7209bd` |
| Tonal | `#e8eefd` | `#ecdfff` |
| Fundo da app | `#f1f5f9` | `#f4f1f8` |
| Menu (gradiente) | `#0e1626` → `#121d33` | `#2e0348` → `#420465` |
| Status no menu | `#13a36b` | `#a7d296` |

---

## 2. Fundações (tokens)

### 2.1 Primitivos (só no tema Nubank)

Definidos em `[data-theme='nubank-parque']`. Preferir os semânticos da seção seguinte em telas genéricas.

| Token | Hex | Uso |
|-------|-----|-----|
| `--core-purple` | `#8d0de3` | Referência do guia; igual a `--brand` |
| `--purple-900` | `#420465` | Tinta escura; títulos fortes; base do menu |
| `--purple-300` | `#cba5fd` | Apoio / destaque leve |
| `--purple-100` | `#ecdfff` | Fundo tonal |
| `--purple-1000` | `#1e002f` | Áreas Premium — **nunca no menu** |
| `--green-900` | `#174006` | Sucesso / disponível |
| `--green-300` | `#a7d296` | Badge / status no sidebar |
| `--green-200` | `#c9e2bf` | Borda sucesso |
| `--green-100` | `#e9f7e4` | Fundo sucesso |

### 2.2 Semânticos (usar estes)

Resolvem para Core Purple / verde quando `data-theme="nubank-parque"`. Funcionam nas duas paletas.

#### Marca

| Token | Nubank Parque | Uso |
|-------|---------------|-----|
| `--brand` / `--wtorre` | `#8d0de3` | CTA, links ativos, foco, ícone do dropzone |
| `--brand-hover` / `--wtorre-hover` | `#7209bd` | Hover / pressed |
| `--brand-tonal-bg` / `--wtorre-tonal-bg` | `#ecdfff` (`--purple-100`) | Fundos tonais, chips, hover suave |
| `--brand-focus-ring` / `--wtorre-focus-ring` | mix 25% da marca | Halo de foco |
| `--brand-ink` | `#420465` (`--purple-900`) | Títulos fortes / tinta |

Aliases de compatibilidade: `--wtorre-600` → hover; `--wtorre-tint` → tonal; `--wtorre-tint-2` → mix 18% branco + marca; `--color-primary*` → marca.

#### Status

| Token | Valor | Uso |
|-------|-------|-----|
| `--success` | `#174006` (`--green-900`) | Sucesso / disponível |
| `--success-soft-bg` | `#e9f7e4` (`--green-100`) | Fundo sucesso |
| `--success-border` | `#c9e2bf` (`--green-200`) | Borda sucesso |
| `--warning` | `#b45309` | Aviso / pendente |
| `--warning-soft-bg` | `#fef3e2` | Fundo aviso |
| `--danger` | `#e11d48` | Excluir / irreversível (igual nas duas paletas) |
| `--danger-soft-bg` | `#fff1f2` | Fundo suave |
| `--danger-border` | `#fecdd3` | Borda soft |
| `--premium` | `#1e002f` (`--purple-1000`) | Premium — nunca no menu |

`--color-success` no Nubank aponta para `--success` (verde), não para a marca.

#### Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `--text-primary` / `--app-text` | `#1e293b` | Texto principal |
| `--text-muted` / `--app-text-muted` | `#64748b` | Texto secundário |

#### Superfícies e bordas

| Token | Nubank Parque | Uso |
|-------|---------------|-----|
| `--color-bg-primary` / `--app-bg` | `#f4f1f8` | Fundo da aplicação |
| `--color-bg-surface` | `#ffffff` | Cards, painéis, campos |
| `--color-bg-surface-alt` | `#faf8fd` | Superfície alternativa |
| `--color-border-primary` / `--app-border` | `#e6e2ec` | Bordas |
| `--app-nav-hover-bg` | `#f4f1f8` | Hover de nav em superfície clara |
| `--app-nav-active-bg` | mix marca 12% | Item ativo em nav clara (ex.: Configurações) |
| `--app-nav-active-text` | marca | Texto do item ativo em nav clara |

**Não** usar `--app-nav-*` no sidebar escuro.

### 2.3 Menu (`--menu-*`)

Chrome **sempre escuro**. No Nubank: Purple 900 + ativo Core Purple + status Green 300.

| Token | Nubank Parque | Uso |
|-------|---------------|-----|
| `--menu-bg-top` | `#2e0348` | Topo do gradiente |
| `--menu-bg` | `#420465` (`--purple-900`) | Base do gradiente |
| `--menu-active` | `#8d0de3` (`--core-purple`) | Item ativo / barra esquerda |
| `--menu-label-inactive` | `#e9def7` | Label inativo |
| `--menu-icon-inactive` | `#b9a3e4` | Ícone inativo |
| `--menu-section` | `#a98fd6` | Cabeçalho de seção |
| `--menu-label-active` | `#ffffff` | Label / ícone ativo |
| `--menu-status` | `#a7d296` (`--green-300`) | Badge de pendências |
| `--menu-line` | lavanda 12% | Separadores |
| `--menu-muted` | `#b9a3e4` | Texto auxiliar |

O layout mapeia `--menu-*` para `--wt-sidebar*` / `--wt-menu-*`. Não hardcodar hex no SCSS do layout.

### 2.4 Tipografia

Fontes no `index.html`: **Sora** + **Plus Jakarta Sans**.

| Token | Família | Uso | Pesos |
|-------|---------|-----|-------|
| `--font-display` | Sora | Títulos, marca, wordmark | 500–800 |
| `--font-body` | Plus Jakarta Sans | Corpo, labels, campos | 400–700 |

Classes globais:

| Classe | Papel |
|--------|-------|
| `.page-title` | Título da página — Sora, `text-2xl`, bold |
| `.page-subtitle` | Subtítulo — `text-sm`, slate |
| `.page-section-title` | Título de seção — Sora, `text-xl` |
| `.page-section-subtitle` | Subtítulo de seção |

`html` / `body` usam `--font-body` e `accent-color: var(--brand)`.

### 2.5 Forma

| Token | Valor | Uso |
|-------|-------|-----|
| `--form-field-height` | `2.625rem` (~42px) | Altura de input, select, botões de ação |
| `--form-radius` | `0.75rem` (~12px) | Campos, botões, dropzone |

Pills só em chips e na ação do dropzone (`upload-dropzone__action`). Cards usam `rounded-xl` / `rounded-2xl` via classes globais.

### 2.6 Logos

| Contexto | Asset | Quem resolve |
|----------|-------|--------------|
| Sidebar, login, convite (fundo escuro / wordmark branco) | `assets/logo-nubank-parque-negativo.png` | `ThemeService.logoSidebarSrc()` / `logoFullSrc()` |
| Wordmark roxo (fundo claro, opcional) | `assets/logo-nubank-parque.png` | Uso pontual |
| Paleta WTorre | `assets/logo.svg` / `assets/wt-mark.svg` | Mesmo serviço |

`logoAlt()` retorna `"Nubank Parque"` quando a paleta está ativa. O layout adiciona `.theme-nubank` e `.logo-mark--wordmark` para padding/logo.

---

## 3. Componentes

Classes globais em [`frontend/src/styles/_components.scss`](../src/styles/_components.scss) e [`frontend/src/styles.scss`](../src/styles.scss). Preferir estas classes a Tailwind ad hoc de marca.

### 3.1 Botões

Hierarquia única. No máximo **um** botão colorido por contexto.

| Tipo | Classe | Token | Quando usar |
|------|--------|-------|-------------|
| Primária | `btn-action-primary` | fundo `--brand` / `--wtorre`, hover `--brand-hover`, texto branco | Salvar, Enviar, Adicionar, Confirmar |
| Secundária | `btn-action-secondary` | branco + `--app-border` | Cancelar, Fechar, Voltar — **nunca colorida** |
| Tonal | `btn-action-tonal` | fundo `--brand-tonal-bg`, texto `--brand` | Apoio (ex.: baixar template) |
| Destrutiva | `btn-action-danger` ou `[danger]` no kebab | `--danger` | Excluir / remover irreversível |

Regras:

- Rótulos descritivos: **"Salvar colaborador"**, não só "Salvar".
- `disabled` = cinza real + atributo `disabled`, nunca só opacidade.
- Legacy `.btn-primary`, `.btn-secondary`, `.btn-primary-blue` = aliases — código novo usa `btn-action-*`.
- Verde Nubank não vira botão primário.

```html
<button type="button" class="btn-action-secondary">Cancelar</button>
<button type="submit" class="btn-action-primary">Salvar colaborador</button>
```

### 3.2 Formulários

| Classe | Papel | Token / regra |
|--------|-------|----------------|
| `form-label` | Label uppercase, xs, bold | slate-500 |
| `form-label__optional` | Sufixo "(opcional)" | peso normal |
| `form-field` | Input / textarea | altura `--form-field-height`, raio `--form-radius`, foco borda `--wtorre` + halo `--wtorre-focus-ring` |
| `form-select` | Select com seta custom | `accent-color: var(--brand)` |

Filtros de listagem: texto com debounce 500 ms; select/date/checkbox imediatamente; sem botão **Filtrar**.

```html
<label class="form-label">
  Nome <span class="form-label__optional">(opcional)</span>
</label>
<input class="form-field" type="text" />
<select class="form-select">...</select>
```

### 3.3 Superfícies

| Classe | Papel |
|--------|-------|
| `card-surface` | Card branco, `rounded-xl`, borda `--app-border`, `shadow-sm` |
| `stat-card` | KPI (`card-surface` + ícone/label/valor) |
| `settings-panel` | Shell de configurações (nav + conteúdo) |
| `settings-nav-link` / `settings-nav-active` | Nav clara — usa `--app-nav-*` |
| `table-head` | Cabeçalho de tabela (uppercase, xs) |

### 3.4 Modal

Usar `<app-modal>`. **Não** criar overlays `fixed inset-0`.

| Detalhe | Padrão |
|---------|--------|
| Tamanhos | `sm` \| `md` \| `lg` \| `xl` |
| Footer | `modal-footer`: secundária à esquerda da primária, grupo à direita |
| A11y | `role="dialog"`, `aria-modal`, foco no 1º campo, Esc, focus trap |
| Destrutivo | SweetAlert2 via `NotificationService` — fora de `<app-modal>` |

```html
<app-modal [open]="showModal()" title="Editar colaborador" size="md" (close)="fecharModal()">
  <div modal-footer class="modal-footer">
    <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
    <button type="submit" class="btn-action-primary">Salvar colaborador</button>
  </div>
</app-modal>
```

### 3.5 Upload

Padrão obrigatório em uploads novos: `upload-dropzone upload-dropzone--banner`.

- Ícone, borda e hover usam `--wtorre*` / `--brand` (herdam o tema).
- Ação do dropzone (`upload-dropzone__action`) pode ser pill.
- Estados: `--dragover`, `--selected`; `aria-disabled` quando bloqueado.

### 3.6 Tabelas (ações)

Componentes em `frontend/src/app/shared/actions/`:

- `app-action-menu` — container
- `app-action-btn` — ícone (`neutral` Editar; `danger` Remover)
- `app-action-dropdown` + `button[appActionDropdownItem]` — kebab

Ordem na linha: **Editar** direto → demais no kebab → **Excluir** por último, `[danger]`, após `action-dropdown__divider`. Todo item do dropdown leva SVG `action-dropdown__item-icon`. Nunca link/texto colorido como ação de linha.

### 3.7 Sidebar

Layout: `.wt-layout` + modificador `.theme-nubank` quando a paleta está ativa.

```
.wt-layout.theme-nubank
  ├── aside.wt-sidebar     chrome --menu-* (gradiente roxo)
  │   ├── .brand           logo negativo
  │   ├── .profile
  │   ├── nav .wt-nav-item
  │   └── .logout
  └── .wt-main
```

Item ativo (`.wt-nav-item.active`):

- Fundo: `color-mix` de `--menu-active` (~22%) sobre o chrome
- Texto/ícone: `--menu-label-active`
- Barra esquerda `::before` 3px com `--menu-active`

Detalhamento: [menu-lateral.md](./menu-lateral.md).

### 3.8 Auth / login (só tema Nubank)

Quando `ThemeService.palette() === 'nubank-parque'`, usar os blocos BEM existentes — não reinventar layout.

**Shell** (`auth-layout`): `.auth-nubank`

| Classe | Papel |
|--------|-------|
| `.auth-nubank__hero` | Coluna hero roxa |
| `.auth-nubank__bars` | Barras verdes SVG (herança) |
| `.auth-nubank__wm` | Wordmark "Nubank Parque" |
| `.auth-nubank__tagline` | "Viver o momento." |
| `.auth-nubank__panel` | Coluna do formulário |

**Formulário** (`login` / convite): `.login-nubank` (~392px)

| Classe | Papel | Token |
|--------|-------|-------|
| `.login-nubank__brand` + `__underline` | Wordmark + traço | `--core-purple` |
| `.login-nubank__title` | Título | `--purple-900` / Sora |
| `.login-nubank__input` | Campo | foco marca |
| `.login-nubank__submit` | CTA | `--core-purple` |
| `.login-nubank__ms` / `__chip` | Entrada Microsoft | — |

Referências: `login.component.ts`, `invite-register.component.ts`, `auth-layout.component.ts`. Mock estático: `docs/login-nubank.html`.

---

## 4. Estados e anti-padrões

### Estados

| Estado | Como expressar |
|--------|----------------|
| Sucesso / disponível | `--success`, `--success-soft-bg`, `--success-border` — badge, chip, ícone. **Não** botão primário |
| Aviso / pendente | `--warning`, `--warning-soft-bg` |
| Perigo | `--danger*` — só ação irreversível |
| Disabled | cinza real + `disabled` (botão) ou `bg-slate-50` (campo) |
| Foco | borda `--brand` + halo `--brand-focus-ring` |
| Item de nav (clara) | `--app-nav-active-*` |
| Item de menu (escuro) | `--menu-active` + barra |

Toasts SweetAlert2 (`.swal2-toast.app-toast`) usam superfícies/tokens; a barra de progresso usa `--wtorre` (herda a marca).

### Anti-padrões

```scss
/* ❌ Hex de marca */
.btn { background: #8d0de3; }

/* ✅ Token semântico */
.btn { background: var(--brand); }
```

Proibido:

- Hex roxo/verde solto (`#8d0de3`, `#820AD1`, `#174006`…) em componentes
- CTA verde Nubank competindo com Core Purple
- Par de botões coloridos no mesmo footer (roxo + verde, primária + danger lado a lado como CTAs iguais)
- Redefinir `--brand` / `--wtorre` com hex em `:host`
- Usar `--purple-1000` / `--premium` no chrome do menu
- Overlay modal inline (`fixed inset-0`) no lugar de `<app-modal>`
- Link "Remover" em `text-rose-600` na coluna de ações
- Inventar terceira paleta ou dark mode genérico

Preferir `--brand*` em telas genéricas. `--purple-*` / `--green-*` / `--core-purple` só em login, convite ou premium explícito.

O dashboard (`dashboard.component.scss`) ainda usa tokens locais `--db-*` — são um desvio conhecido, não parte deste DS. Telas novas não devem copiar esse padrão.

---

## 5. Mapa de arquivos

### Fonte de verdade

| Arquivo | Papel |
|---------|-------|
| [`frontend/src/styles/_tokens.scss`](../src/styles/_tokens.scss) | Tokens CSS — única fonte de cores |
| [`frontend/src/styles/_components.scss`](../src/styles/_components.scss) | Botões, forms, dropzone, action-menu |
| [`frontend/src/styles.scss`](../src/styles.scss) | Entry: títulos, cards, settings, toasts |

### Tema e persistência

| Arquivo | Papel |
|---------|-------|
| [`frontend/src/app/core/services/theme.service.ts`](../src/app/core/services/theme.service.ts) | `data-theme`, logos, cache |
| [`frontend/src/app/pages/admin/appearance/appearance-settings.component.ts`](../src/app/pages/admin/appearance/appearance-settings.component.ts) | UI das 2 paletas |
| `backend/modules/system-settings/` | Persistência `color_palette` |

### Layouts Nubank

| Arquivo | Papel |
|---------|-------|
| `frontend/src/app/layouts/main-layout.component.*` | Sidebar `.theme-nubank` |
| `frontend/src/app/layouts/auth-layout.component.*` | Split `auth-nubank` |
| `frontend/src/app/pages/login/login.component.*` | BEM `login-nubank` |
| `frontend/src/app/pages/auth/invite-register.component.ts` | Convite Nubank |

### Assets

| Arquivo | Uso |
|---------|-----|
| `frontend/src/assets/logo-nubank-parque-negativo.png` | Wordmark branco |
| `frontend/src/assets/logo-nubank-parque.png` | Wordmark roxo |

### Docs e rules

| Arquivo | Papel |
|---------|-------|
| [cores.md](./cores.md) | Tabela de tokens (duas paletas) |
| [menu-lateral.md](./menu-lateral.md) | Sidebar em detalhe |
| [UI-AUDIT-DESVIOS.md](./UI-AUDIT-DESVIOS.md) | Backlog de migração de telas |
| `.cursor/rules/ui-padrao.mdc` | Padrão UI completo |
| `.cursor/rules/ui-tokens.mdc` | Regras de tokens |
| `.cursor/rules/ui-botoes.mdc` | Hierarquia `btn-action-*` |
| `.cursor/rules/ui-sidebar.mdc` | Sidebar |
| `.cursor/rules/ui-modal-forms.mdc` | Modal + forms + filtros |
| `.cursor/rules/ui-upload.mdc` | Dropzone |
| `.cursor/rules/ui-acoes-tabela.mdc` | Kebab e ícones |

### Checklist para tela nova (Nubank-ready)

- [ ] `btn-action-*`, `form-*`, `card-surface` — sem hex de marca
- [ ] Cores via `var(--brand)` / `var(--wtorre*)` / `var(--danger)` / `var(--success*)`
- [ ] Títulos com `--font-display` ou `.page-title`
- [ ] Dialogs com `<app-modal>`
- [ ] Uploads com `upload-dropzone--banner`
- [ ] Testar com paleta Nubank em Configurações → Aparência
- [ ] Evitar `--purple-*` salvo login/premium explícito
