# Tema de cores — Nubank Parque

Paleta `nubank-parque` do Credenciamento. Identidade do estádio: **roxo + verde + branco + cinza**.

Ativação: `html[data-theme="nubank-parque"]`  
Fonte no CSS: [`frontend/src/styles/_tokens.scss`](../src/styles/_tokens.scss)

---

## Essência

| Papel | Cor | HEX |
|-------|-----|-----|
| Marca / CTA | Core Purple | `#8d0de3` |
| Tinta / chrome | Purple 900 | `#420465` |
| Herança (status) | Green 900 / 300 | `#174006` / `#a7d296` |
| Superfície | Branco | `#ffffff` |
| Fundo da app | Lavanda gelo | `#f4f1f8` |
| Neutro | Cinza ardósia | `#1e293b` / `#64748b` |

O Core Purple (`#8d0de3`) é a tinta de produto do estádio — vizinho do roxo masterbrand Nubank (`#820AD1`), saturado para UI digital. O verde não compete com o CTA: é herança da arena e sinal de status.

---

## 1. Família roxa (marca)

<table>
  <thead>
    <tr>
      <th></th>
      <th>Nome</th>
      <th>Token</th>
      <th>HEX</th>
      <th>RGB</th>
      <th>HSL</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#1e002f;border:1px solid #e6e2ec"></span></td>
      <td>Purple 1000</td>
      <td><code>--purple-1000</code> / <code>--premium</code></td>
      <td><code>#1e002f</code></td>
      <td>30, 0, 47</td>
      <td>278°, 100%, 9%</td>
      <td>Áreas Premium — nunca no menu</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#2e0348;border:1px solid #e6e2ec"></span></td>
      <td>Menu topo</td>
      <td><code>--menu-bg-top</code></td>
      <td><code>#2e0348</code></td>
      <td>46, 3, 72</td>
      <td>277°, 92%, 15%</td>
      <td>Início do gradiente do sidebar</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#420465;border:1px solid #e6e2ec"></span></td>
      <td>Purple 900</td>
      <td><code>--purple-900</code> / <code>--brand-ink</code> / <code>--menu-bg</code></td>
      <td><code>#420465</code></td>
      <td>66, 4, 101</td>
      <td>278°, 92%, 21%</td>
      <td>Tinta escura, títulos, base do menu</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#7209bd;border:1px solid #e6e2ec"></span></td>
      <td>Brand hover</td>
      <td><code>--brand-hover</code></td>
      <td><code>#7209bd</code></td>
      <td>114, 9, 189</td>
      <td>275°, 91%, 39%</td>
      <td>Hover / pressed do CTA</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#8d0de3;border:1px solid #e6e2ec"></span></td>
      <td><strong>Core Purple</strong></td>
      <td><code>--core-purple</code> / <code>--brand</code></td>
      <td><code>#8d0de3</code></td>
      <td>141, 13, 227</td>
      <td>272°, 89%, 47%</td>
      <td>Primária, CTA, links, item ativo</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#cba5fd;border:1px solid #e6e2ec"></span></td>
      <td>Purple 300</td>
      <td><code>--purple-300</code></td>
      <td><code>#cba5fd</code></td>
      <td>203, 165, 253</td>
      <td>266°, 96%, 82%</td>
      <td>Apoio / destaque leve</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#ecdfff;border:1px solid #e6e2ec"></span></td>
      <td>Purple 100</td>
      <td><code>--purple-100</code> / <code>--brand-tonal-bg</code></td>
      <td><code>#ecdfff</code></td>
      <td>236, 223, 255</td>
      <td>264°, 100%, 94%</td>
      <td>Fundo tonal, chips, hover suave</td>
    </tr>
  </tbody>
</table>

### Escala visual

```
#1e002f  #2e0348  #420465  #7209bd  #8d0de3  #cba5fd  #ecdfff
 1000    menu↑     900     hover     CORE      300      100
```

<div style="display:flex;height:48px;border-radius:10px;overflow:hidden;border:1px solid #e6e2ec">
  <div style="flex:1;background:#1e002f"></div>
  <div style="flex:1;background:#2e0348"></div>
  <div style="flex:1;background:#420465"></div>
  <div style="flex:1;background:#7209bd"></div>
  <div style="flex:1.4;background:#8d0de3"></div>
  <div style="flex:1;background:#cba5fd"></div>
  <div style="flex:1;background:#ecdfff"></div>
</div>

---

## 2. Família verde (herança)

Verde da arena / Palmeiras. **Status e sucesso** — nunca botão primário.

<table>
  <thead>
    <tr>
      <th></th>
      <th>Nome</th>
      <th>Token</th>
      <th>HEX</th>
      <th>RGB</th>
      <th>HSL</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#174006;border:1px solid #e6e2ec"></span></td>
      <td>Green 900</td>
      <td><code>--green-900</code> / <code>--success</code></td>
      <td><code>#174006</code></td>
      <td>23, 64, 6</td>
      <td>102°, 83%, 14%</td>
      <td>Texto / ícone de sucesso</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#a7d296;border:1px solid #e6e2ec"></span></td>
      <td>Green 300</td>
      <td><code>--green-300</code> / <code>--menu-status</code></td>
      <td><code>#a7d296</code></td>
      <td>167, 210, 150</td>
      <td>103°, 40%, 71%</td>
      <td>Badge de pendências no sidebar</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#c9e2bf;border:1px solid #e6e2ec"></span></td>
      <td>Green 200</td>
      <td><code>--green-200</code> / <code>--success-border</code></td>
      <td><code>#c9e2bf</code></td>
      <td>201, 226, 191</td>
      <td>103°, 38%, 82%</td>
      <td>Borda de sucesso</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#e9f7e4;border:1px solid #e6e2ec"></span></td>
      <td>Green 100</td>
      <td><code>--green-100</code> / <code>--success-soft-bg</code></td>
      <td><code>#e9f7e4</code></td>
      <td>233, 247, 228</td>
      <td>104°, 54%, 93%</td>
      <td>Fundo de sucesso</td>
    </tr>
  </tbody>
</table>

<div style="display:flex;height:48px;border-radius:10px;overflow:hidden;border:1px solid #e6e2ec">
  <div style="flex:1;background:#174006"></div>
  <div style="flex:1;background:#a7d296"></div>
  <div style="flex:1;background:#c9e2bf"></div>
  <div style="flex:1;background:#e9f7e4"></div>
</div>

---

## 3. Neutros (branco + cinza)

<table>
  <thead>
    <tr>
      <th></th>
      <th>Nome</th>
      <th>Token</th>
      <th>HEX</th>
      <th>RGB</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#ffffff;border:1px solid #e6e2ec"></span></td>
      <td>Branco</td>
      <td><code>--color-bg-surface</code></td>
      <td><code>#ffffff</code></td>
      <td>255, 255, 255</td>
      <td>Cards, painéis, campos</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#faf8fd;border:1px solid #e6e2ec"></span></td>
      <td>Superfície alt</td>
      <td><code>--color-bg-surface-alt</code></td>
      <td><code>#faf8fd</code></td>
      <td>250, 248, 253</td>
      <td>Faixa / fundo alternativo</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#f4f1f8;border:1px solid #e6e2ec"></span></td>
      <td>Fundo da app</td>
      <td><code>--app-bg</code> / <code>--color-bg-primary</code></td>
      <td><code>#f4f1f8</code></td>
      <td>244, 241, 248</td>
      <td>Canvas da aplicação</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#e6e2ec;border:1px solid #cfc8d8"></span></td>
      <td>Borda</td>
      <td><code>--app-border</code></td>
      <td><code>#e6e2ec</code></td>
      <td>230, 226, 236</td>
      <td>Bordas e divisores claros</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#64748b;border:1px solid #e6e2ec"></span></td>
      <td>Texto secundário</td>
      <td><code>--text-muted</code></td>
      <td><code>#64748b</code></td>
      <td>100, 116, 139</td>
      <td>Labels, hints, metadados</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#1e293b;border:1px solid #e6e2ec"></span></td>
      <td>Texto principal</td>
      <td><code>--text-primary</code></td>
      <td><code>#1e293b</code></td>
      <td>30, 41, 59</td>
      <td>Corpo, títulos em superfície clara</td>
    </tr>
  </tbody>
</table>

---

## 4. Menu (chrome escuro)

Gradiente Purple 900. Item ativo = Core Purple. Status = Green 300.

<table>
  <thead>
    <tr>
      <th></th>
      <th>Token</th>
      <th>HEX</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#2e0348"></span></td>
      <td><code>--menu-bg-top</code></td>
      <td><code>#2e0348</code></td>
      <td>Topo do gradiente</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#420465"></span></td>
      <td><code>--menu-bg</code></td>
      <td><code>#420465</code></td>
      <td>Base do gradiente</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#8d0de3"></span></td>
      <td><code>--menu-active</code></td>
      <td><code>#8d0de3</code></td>
      <td>Item ativo / barra esquerda</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#ffffff;border:1px solid #e6e2ec"></span></td>
      <td><code>--menu-label-active</code></td>
      <td><code>#ffffff</code></td>
      <td>Label e ícone ativos</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#e9def7"></span></td>
      <td><code>--menu-label-inactive</code></td>
      <td><code>#e9def7</code></td>
      <td>Label inativo (lavanda)</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#b9a3e4"></span></td>
      <td><code>--menu-icon-inactive</code> / <code>--menu-muted</code></td>
      <td><code>#b9a3e4</code></td>
      <td>Ícone / texto auxiliar</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#a98fd6"></span></td>
      <td><code>--menu-section</code></td>
      <td><code>#a98fd6</code></td>
      <td>Cabeçalho de seção</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#a7d296"></span></td>
      <td><code>--menu-status</code></td>
      <td><code>#a7d296</code></td>
      <td>Badge de pendências</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#420465;box-shadow:inset 0 0 0 1px rgba(233,222,247,0.12)"></span></td>
      <td><code>--menu-line</code></td>
      <td><code>rgba(233, 222, 247, 0.12)</code></td>
      <td>Separadores</td>
    </tr>
  </tbody>
</table>

```
#2e0348 ──→ #420465     gradiente do sidebar
     │
     ├── ativo     #8d0de3
     ├── label     #e9def7  /  #ffffff
     ├── ícone     #b9a3e4
     ├── seção     #a98fd6
     └── status    #a7d296
```

---

## 5. Feedback (aviso e perigo)

Iguais nas duas paletas do sistema — não são tinta de marca.

<table>
  <thead>
    <tr>
      <th></th>
      <th>Token</th>
      <th>HEX</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#b45309"></span></td>
      <td><code>--warning</code></td>
      <td><code>#b45309</code></td>
      <td>Aviso / pendente</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#fef3e2;border:1px solid #e6e2ec"></span></td>
      <td><code>--warning-soft-bg</code></td>
      <td><code>#fef3e2</code></td>
      <td>Fundo de aviso</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#e11d48"></span></td>
      <td><code>--danger</code></td>
      <td><code>#e11d48</code></td>
      <td>Excluir / irreversível</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#fff1f2;border:1px solid #e6e2ec"></span></td>
      <td><code>--danger-soft-bg</code></td>
      <td><code>#fff1f2</code></td>
      <td>Fundo destrutivo</td>
    </tr>
    <tr>
      <td><span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#fecdd3;border:1px solid #e6e2ec"></span></td>
      <td><code>--danger-border</code></td>
      <td><code>#fecdd3</code></td>
      <td>Borda destrutiva</td>
    </tr>
  </tbody>
</table>

---

## 6. Mixagens (não são hex fixos)

| Token | Fórmula | Uso |
|-------|---------|-----|
| `--brand-focus-ring` | `color-mix(in srgb, var(--brand) 25%, transparent)` | Halo de foco |
| `--wtorre-tint-2` | `color-mix(in srgb, var(--brand) 18%, white)` | Tint leve |
| `--color-primary-light` | `color-mix(in srgb, var(--brand) 70%, white)` | Primária clara |
| `--app-nav-active-bg` | `color-mix(in srgb, var(--brand) 12%, white)` | Item ativo em nav clara |

---

## 7. Papéis semânticos

| Precisa de… | Use |
|-------------|-----|
| Botão / link / foco | `--brand` → hover `--brand-hover` |
| Fundo suave da marca | `--brand-tonal-bg` |
| Título forte / tinta | `--brand-ink` |
| Sucesso / disponível | `--success` + `--success-soft-bg` + `--success-border` |
| Premium | `--premium` (nunca no sidebar) |
| Fundo da tela | `--app-bg` |
| Card | `--color-bg-surface` + `--app-border` |
| Texto | `--text-primary` / `--text-muted` |
| Excluir | `--danger` |

Em telas genéricas, preferir `--brand*` / `--success*` / `--danger`. Tokens `--purple-*` / `--green-*` / `--core-purple` ficam para login, convite ou premium explícito.

---

## 8. CSS da paleta

Cópia de `[data-theme='nubank-parque']` em `_tokens.scss`:

```css
[data-theme='nubank-parque'] {
  --core-purple: #8d0de3;
  --purple-900: #420465;
  --purple-300: #cba5fd;
  --purple-100: #ecdfff;
  --purple-1000: #1e002f;
  --green-900: #174006;
  --green-300: #a7d296;
  --green-200: #c9e2bf;
  --green-100: #e9f7e4;

  --brand: #8d0de3;
  --brand-hover: #7209bd;
  --brand-tonal-bg: var(--purple-100);
  --brand-ink: var(--purple-900);

  --success: var(--green-900);
  --success-soft-bg: var(--green-100);
  --success-border: var(--green-200);

  --warning: #b45309;
  --warning-soft-bg: #fef3e2;
  --danger: #e11d48;
  --danger-soft-bg: #fff1f2;
  --danger-border: #fecdd3;
  --premium: var(--purple-1000);

  --color-bg-primary: #f4f1f8;
  --color-bg-surface: #ffffff;
  --color-bg-surface-alt: #faf8fd;
  --color-border-primary: #e6e2ec;
  --text-primary: #1e293b;
  --text-muted: #64748b;

  --menu-bg-top: #2e0348;
  --menu-bg: var(--purple-900);
  --menu-active: var(--core-purple);
  --menu-label-inactive: #e9def7;
  --menu-icon-inactive: #b9a3e4;
  --menu-section: #a98fd6;
  --menu-label-active: #ffffff;
  --menu-status: var(--green-300);
  --menu-line: rgba(233, 222, 247, 0.12);
  --menu-muted: #b9a3e4;
}
```

---

## 9. Regras

1. Sempre `var(--token)` — nunca hex de marca (`#8d0de3`, `#820AD1`, verdes) em telas.
2. Um botão colorido por contexto. Primária = Core Purple.
3. Verde = status / sucesso. Não vira CTA.
4. `--purple-1000` / `--premium` nunca no menu.
5. Não inventar terceira paleta nem dark mode genérico.
6. Alterar cor: editar `_tokens.scss` (e este arquivo). Não CSS ad hoc por página.

---

## Referências

- Identidade do estádio: roxo, verde, branco e cinza ([Universo Palestrino](https://universopalestrino.com.br/nubank-parque-nova-identidade-visual/)).
- Roxo masterbrand Nubank (referência, não token de produto): `#820AD1`.
- Design system completo: [design-system-nubank-parque.md](./design-system-nubank-parque.md)
- Tokens das duas paletas: [cores.md](./cores.md)
