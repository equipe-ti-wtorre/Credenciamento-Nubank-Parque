# Padrão — Menu lateral (sidebar)

Referência de implementação: `src/app/layouts/main-layout.component.{ts,html,scss}`.  
Tokens de cor: `src/styles/_tokens.scss` (também em [cores.md](./cores.md)).  
Rule Cursor: `.cursor/rules/ui-sidebar.mdc`.

O chrome do menu é **sempre escuro** (gradiente), nas paletas WTorre e Nubank. Não usar menu claro com pill azul no sidebar global.

---

## Estrutura

```
.wt-layout                    grid 264px 1fr | 100vh
  ├── aside.wt-sidebar
  │   ├── .brand              logo + botão collapse
  │   ├── .profile            avatar + nome + role
  │   ├── .nav-shell
  │   │   ├── .nav-scroll-hint--up
  │   │   ├── nav.nav         NavGroup[] → .nav-label + a.wt-nav-item
  │   │   └── .nav-scroll-hint--down
  │   └── button.logout
  └── .wt-main
      ├── header.wt-topbar
      └── main.wt-content → router-outlet
```

| Classe / modificador | Função |
|----------------------|--------|
| `.wt-layout` | Shell autenticado |
| `.wt-layout.collapsed` | Largura `78px 1fr` (expandido: `264px 1fr`) |
| `.wt-layout.theme-nubank` | Ajustes de logo/padding (paleta Nubank) |
| `.wt-layout.is-gate-page` | Contexto Portaria |
| `.wt-sidebar` | Coluna do menu |
| `.wt-nav-item` | Item de navegação |
| `.wt-nav-item.active` | Rota ativa |
| `.nav-label` | Título de seção (Operação, Administração…) |

Não há componente `Sidebar` / `NavItem` reutilizável separado: a lógica vive no `MainLayoutComponent`.

---

## Tokens `--menu-*`

Aliases no layout: `--wt-sidebar*` / `--wt-menu-*` mapeiam de `--menu-*`. **Não hardcodar hex** no SCSS do layout.

| Token | Uso |
|-------|-----|
| `--menu-bg-top` / `--menu-bg` | Gradiente do chrome |
| `--menu-active` | Barra e destaque do item ativo |
| `--menu-label-inactive` / `--menu-icon-inactive` | Item inativo |
| `--menu-section` | Cabeçalho de seção |
| `--menu-label-active` | Texto/ícone do item ativo |
| `--menu-status` | Badge de pendências |
| `--menu-line` | Separadores |
| `--menu-muted` | Texto auxiliar |

Valores WTorre vs Nubank: ver [cores.md](./cores.md).

### Item ativo

`.wt-nav-item.active`:

- Fundo: `color-mix` de `--menu-active` (~22%) sobre o chrome escuro
- Texto/ícone: `--menu-label-active`
- Barra esquerda `::before` 3px com `--menu-active`

**Não** usar tokens `--app-nav-*` no sidebar escuro — eles são para nav em superfície clara (ex.: Configurações).

---

## Modelo de dados

### Grupos e itens (runtime)

```ts
interface NavItem {
  label: string;
  route: string;
  iconHtml?: SafeHtml;       // SVG sanitizado (preferido)
  iconLibrary?: 'svg' | 'material' | 'fontawesome' | 'image';
  iconName?: string;
  iconSrc?: string;
  exact?: boolean;           // true em Início e Portaria
  showBadge?: boolean;
  badgeSource?: 'approvals' | 'document';
}

interface NavGroup {
  title?: string;            // omitido no grupo base
  items: NavItem[];
}
```

### Origem dos itens

| Grupo | Fonte | Observação |
|-------|--------|------------|
| *(sem título)* | Hardcoded em `buildNav()` | Início, Aprovações |
| `Operação` | Hardcoded em `buildNav()` | Portaria, mercadorias, eventos… |
| `Administração` | `ADMIN_MENU_ITEMS` + `ADMIN_MENU_MODULE_MAP` | `admin-menu.config.ts` |
| `Gestão` | Fallback | Só Setores, se gestor de setor sem itens admin |

Config de administração:

```ts
// src/app/config/admin-menu.config.ts
export interface AdminMenuItem {
  label: string;
  icon: string;              // emoji legado (UI usa SVG/iconKey)
  iconKey?: string;          // chave em rawIcons do MainLayout
  iconLibrary?: MenuIconLibrary;
  iconName?: string;
  iconSrc?: string;
  route: string;
}
```

Cada rota admin mapeia para um módulo de permissão em `ADMIN_MENU_MODULE_MAP`.

---

## Permissões

- Visibilidade: `hasPermission(user, module, 'view')` (`AuthService`).
- Super admin vê tudo.
- Roles legados (`ADMIN`, `CONTROLADOR`…) só alimentam o label do perfil — **não** filtram o menu.
- Rotas devem espelhar o menu com `PermissionGuard` + `data.permission`.

Filtro dos itens admin:

```ts
ADMIN_MENU_ITEMS.filter((item) => {
  const module = ADMIN_MENU_MODULE_MAP[item.route];
  return module ? hasPermission(user, module, 'view') : true;
}).map((item) => this.mapMenuItem(item));
```

---

## Template do item

```html
<a
  class="wt-nav-item"
  [routerLink]="item.route"
  routerLinkActive="active"
  [routerLinkActiveOptions]="{ exact: !!item.exact }"
  [title]="collapsed() ? item.label : ''"
>
  <span class="ico">…</span>
  <span class="txt">{{ item.label }}</span>
  @if (item.showBadge && badgeCountFor(item) > 0) {
    <span class="badge">…</span>
  }
</a>
```

### Ícones (ordem de prioridade no template)

1. Font Awesome (`iconLibrary: 'fontawesome'` + `iconName`)
2. Material Symbols (`iconLibrary: 'material'` + `iconName`)
3. Imagem (`iconLibrary: 'image'` + `iconSrc`) — ex.: Frota
4. SVG inline via `iconHtml` / `iconKey` (padrão preferido)

Novos SVGs: registrar path em `rawIcons` no `MainLayoutComponent` e referenciar por `iconKey`.

### Badges

| Item | `badgeSource` | Serviço |
|------|---------------|---------|
| Aprovações | `approvals` | `ApprovalService.countPending()` |
| Aprovações documento | `document` | `DocumentChangeService.countPending()` |

---

## Collapse

- Signal `collapsed`; toggle via `toggleSidebar()`.
- Persistência: chave `sidebarCollapsed` no `StorageService` (`'1'` / `'0'`).
- Collapsed: esconde textos, badges e labels de seção; troca `logo-full` → `logo-mark`; tooltip via `title`.
- Overflow: hints de scroll (cima/baixo) no `nav-shell`.

---

## Como adicionar um item

### Administração (config)

1. Rota em `app.routes.ts` (filho do `MainLayoutComponent`) com `PermissionGuard` e `data.permission` / `data.title`.
2. Módulo em `modules.config.ts` (se novo).
3. Entrada em `ADMIN_MENU_ITEMS` + rota→módulo em `ADMIN_MENU_MODULE_MAP`.
4. Se SVG novo: chave em `rawIcons` + `iconKey` no item.

### Base / Operação

1. Mesmos passos de rota + permissão.
2. `push` condicional em `buildNav()` no grupo certo, com `iconFor('chave')` e `exact` se for rota “raiz” do módulo.

---

## Menu interno de Configurações

Layout separado: `SettingsLayoutComponent` + `SETTINGS_NAV_ITEMS`.

- Classes: `.settings-nav-*` + `routerLinkActive="settings-nav-active"`.
- Tokens: `--app-nav-*` (superfície **clara**).
- Sem filtro de permissão no nav; as rotas filhas usam `PermissionGuard`.

Não misturar esse padrão visual com o sidebar global escuro.

---

## Logos por paleta

| Paleta | Full | Mark |
|--------|------|------|
| WTorre | `assets/logo.svg` | `assets/wt-mark.svg` |
| Nubank Parque | `assets/logo-nubank-parque-negativo.png` | (wordmark; classe `logo-mark--wordmark`) |

Resolvidos por `ThemeService.logoSidebarSrc()` / `logoMarkSrc()`.

---

## Anti-patterns

- Sidebar fundo claro + item ativo em pill / `--app-nav-active-bg`
- Hex solto de menu em telas (usar `--menu-*` / `--wt-*`)
- Inventar classes fora de `.wt-layout` / `.wt-sidebar` / `.wt-nav-item`
- Usar `--purple-1000` / `--premium` no chrome do menu
- Classes legadas `.sidebar-nav-*` (não usar no layout atual)
- Item no menu sem rota + `PermissionGuard` alinhados
