# Rules do projeto

`arquitetura-geral` vale em toda conversa. As demais entram quando o arquivo em contexto casa com o glob.

| Arquivo | Quando entra | O que fixa |
|---------|--------------|------------|
| `arquitetura-geral.mdc` | sempre | Idioma, permissão `modulo.acao`, contrato da API, entrega e revisão |
| `arquitetura-frontend.mdc` | `frontend/**/*.{ts,html,scss}` | Pastas, store com signals, formulários, HTTP |
| `arquitetura-backend.mdc` | `backend/**/*.js` | Camadas, erros, transações, migrações, env |
| `ui-temas.mdc` | front | Paletas `wtorre` e `nubank-parque`, tokens `--brand` e fontes |
| `ui-design.mdc` | front | Botões, modal, campos, filtro e upload |
| `ui-alertas.mdc` | front | Toast e confirmação via `NotificationService` |
| `ui-icones.mdc` | front | SVG do menu e ações de tabela |
| `ui-menu.mdc` | front | Sidebar `.wt-layout` |
| `ui-perfil.mdc` | front | Permissão por módulo, guard e bloco de perfil |
| `ui-login.mdc` | front | Tela de login e logos por paleta |

As rules de UI descrevem classes e comportamento. O front precisa dos tokens, do layout `.wt-layout` e dos componentes citados. Código legado segue o padrão só no trecho alterado.
