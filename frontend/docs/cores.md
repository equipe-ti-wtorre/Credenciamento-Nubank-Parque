# Padrão de cores — Intranet Credenciamento

Fonte única: [`frontend/src/styles/_tokens.scss`](../src/styles/_tokens.scss).  
**Sempre usar tokens CSS** (`var(--…)`), nunca valores hex hardcoded em telas novas.

A paleta ativa do sistema é escolhida em **Configurações → Aparência** e aplicada via atributo `data-theme` no `<html>`:

| Valor | Paleta |
|-------|--------|
| `wtorre` (padrão) | Azul institucional WTorre |
| `nubank-parque` | Core Purple Nubank Parque + herança verde |

O `ThemeService` aplica cache em `localStorage` no boot e sincroniza com `GET /system-settings/appearance` após o login.

Logo conforme a paleta:
- WTorre: `assets/logo.svg`
- Nubank (sidebar, login, convite): `assets/logo-nubank-parque-negativo.png` (wordmark branco)
- Nubank (wordmark roxo, opcional): `assets/logo-nubank-parque.png`

---

## Marca (semântica)

| Token | WTorre | Nubank Parque | Uso |
|-------|--------|---------------|-----|
| `--brand` / `--wtorre` | `#1d54e6` | `#8d0de3` | Cor de marca; botão primário; links ativos |
| `--brand-hover` / `--wtorre-hover` | `#1442ba` | `#7209bd` | Hover/pressed |
| `--brand-tonal-bg` / `--wtorre-tonal-bg` | `#e8eefd` | `#ecdfff` (`--purple-100`) | Fundo tonal |
| `--brand-focus-ring` / `--wtorre-focus-ring` | mix 25% | mix 25% | Halo de foco |

Aliases locais de compatibilidade (herdam a marca):

- `--wtorre-600` → `--wtorre-hover`
- `--wtorre-tint` → `--wtorre-tonal-bg`
- `--wtorre-tint-2` → mix 18% branco + marca

---

## Nubank Parque — tokens extras

| Token | Valor | Uso |
|-------|-------|-----|
| `--core-purple` | `#8d0de3` | Referência do guia |
| `--purple-900` / `--brand-ink` | `#420465` | Tinta escura |
| `--purple-300` | `#cba5fd` | Apoio |
| `--purple-1000` / `--premium` | `#1e002f` | Áreas Premium (não usar no menu) |
| `--success` | `#174006` (`--green-900`) | Sucesso / disponível |
| `--success-soft-bg` | `#e9f7e4` | Fundo sucesso |
| `--success-border` | `#c9e2bf` | Borda sucesso |
| `--warning` | `#b45309` | Aviso / pendente |
| `--warning-soft-bg` | `#fef3e2` | Fundo aviso |

---

## Paleta do menu (sidebar)

Chrome escuro; no Nubank Parque: Purple 900 + ativo Core Purple + status Green 300.

| Token | WTorre | Nubank Parque | Uso |
|-------|--------|---------------|-----|
| `--menu-bg-top` | `#0e1626` | `#2e0348` | Fundo topo (gradiente) |
| `--menu-bg` | `#121d33` | `#420465` (`--purple-900`) | Fundo base |
| `--menu-active` | marca | `#8d0de3` | Item ativo / barra |
| `--menu-label-inactive` | `#aab2c8` | `#e9def7` | Label inativo |
| `--menu-icon-inactive` | `#aab2c8` | `#b9a3e4` | Ícone inativo |
| `--menu-section` | `#5d6883` | `#a98fd6` | Cabeçalho de seção |
| `--menu-label-active` | `#ffffff` | `#ffffff` | Label ativo |
| `--menu-status` | `#13a36b` | `#a7d296` (`--green-300`) | Badge / status |
| `--menu-line` | rgba branco 7% | rgba lavanda 12% | Bordas do menu |
| `--menu-muted` | `#7f8aa6` | `#b9a3e4` | Texto auxiliar |

O layout ([`main-layout.component.scss`](../src/app/layouts/main-layout.component.scss)) mapeia esses tokens para `--wt-sidebar*` / `--wt-menu-*`.

---

## Perigo (destrutivo — igual nas duas paletas)

| Token | Valor | Uso |
|-------|-------|-----|
| `--danger` | `#e11d48` | Excluir / ações irreversíveis |
| `--danger-soft-bg` | `#fff1f2` | Fundo suave |
| `--danger-border` | `#fecdd3` | Borda soft |

---

## Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `--text-primary` / `--app-text` | `#1e293b` | Texto principal |
| `--text-muted` / `--app-text-muted` | `#64748b` | Texto secundário |

---

## Superfícies e bordas

| Token | WTorre | Nubank Parque |
|-------|--------|---------------|
| `--color-bg-primary` / `--app-bg` | `#f1f5f9` | `#f4f1f8` |
| `--color-bg-surface` | `#ffffff` | `#ffffff` |
| `--color-bg-surface-alt` | `#f8fafc` | `#faf8fd` |
| `--color-border-primary` / `--app-border` | `#e2e8f0` | `#e6e2ec` |
| `--app-nav-hover-bg` | `#f1f5f9` | `#f4f1f8` |
| `--app-nav-active-bg` | mix marca 12% | mix marca 12% |
| `--app-nav-active-text` | marca | marca |

---

## Aliases de compatibilidade

| Alias | Resolve para |
|-------|----------------|
| `--color-primary` | `--brand` |
| `--color-primary-dark` | `--brand-hover` |
| `--color-primary-light` | mix 70% branco + marca |
| `--color-success` | WTorre: `--brand` · Nubank: `--success` |
| `--color-text-primary` | `--text-primary` |
| `--color-text-muted` | `--text-muted` |

---

## Regras

1. Referenciar `var(--token)` — não copiar hex nos componentes.
2. Não redefinir `--wtorre` / `--brand` com hex em `:host` ou escopos locais.
3. No máximo **um** botão colorido por contexto (primária ou danger).
4. Alterações de paleta: editar `_tokens.scss` e/ou a escolha em Configurações → Aparência.
