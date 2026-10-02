# Regras de interface para outros projetos

Copie os arquivos `.mdc` desta pasta para `.cursor/rules/` do projeto destino. O Cursor passa a aplicá-las quando houver arquivo `.ts`, `.html` ou `.scss` no contexto.

```text
cursor-rules-export/ui-*.mdc  →  outro-projeto/.cursor/rules/
```

| Arquivo | O que fixa |
|---------|------------|
| `ui-temas.mdc` | Paletas `wtorre` e `nubank-parque`, tokens `--brand` e fontes |
| `ui-menu.mdc` | Sidebar escuro, item ativo, collapse |
| `ui-perfil.mdc` | Permissão por módulo, guard e bloco de perfil |
| `ui-login.mdc` | Cartão de login e entrada Microsoft |
| `ui-icones.mdc` | SVG do menu e ações de tabela |
| `ui-alertas.mdc` | Toast e confirmação via `NotificationService` |
| `ui-design.mdc` | Botões, modal, campos, filtro e upload |

As regras descrevem classes e comportamento. O projeto destino precisa ter (ou passar a ter) os mesmos tokens, o layout `.wt-layout` e os componentes citados. Não é preciso copiar esta pasta `LEIA-ME.md`.
