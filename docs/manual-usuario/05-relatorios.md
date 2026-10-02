# Relatórios

Os relatórios consultam o que já aconteceu. Eles não alteram cadastro, aprovação nem portaria. Filtros de texto aplicam ao digitar; **Limpar** restaura o padrão; **Atualizar** busca de novo.

---

## Relatório de acessos

**Para que serve.** Consultar entradas e saídas da portaria, de credenciais de evento e de acessos de serviço, e exportar a lista.

**Quem usa.** Quem tem permissão de **Visualizar** Relatório de acessos.

**Onde fica.** Menu **Relatórios → Relatório de acessos** (`/operacao/relatorio-acessos`). O cartão **Dentro agora** do Início abre esta tela.

Subtítulo: **Consulte entradas e saídas da portaria (credenciais de evento e acessos de serviço).**

### O que a tela mostra

Duas abas:

| Aba | Conteúdo |
|-----|----------|
| Todos | Todos os acessos do filtro, com contador |
| Sem saída | Quem entrou e ainda não teve saída registrada |

Indicadores:

| Indicador | Significado |
|-----------|-------------|
| Entradas | Quantidade de registros no filtro |
| Ainda no local | Entrou e a saída está vazia. É o “dentro agora” da operação |
| Saídas concluídas | Acessos com saída |
| Evento | Credencial de evento |
| Colaborador | Acesso de serviço de pessoa |
| Veículo | Acesso de serviço de veículo |

Na tabela, o mesmo conceito aparece como status **No local** (saída em branco) ou **Concluído** (com saída).

### Filtros

- **Origem:** Todas, Serviço — colaborador, Serviço — veículo, Evento
- **Status** (somente na aba Todos): Todos, No local, Concluído
- **Evento:** todos ou busca por nome
- **Empresa**
- **De** e **Até**
- **Busca:** nome, documento ou placa
- **Limpar**

### Colunas

Entrada (data e hora), saída (ou traço), origem, pessoa ou veículo, documento ou placa, contexto, empresa e status.

A lista mostra até os **1000** registros mais recentes do filtro. O rodapé indica **Mostrando X de Y registros**.

### Exportar

**Exportar Excel** gera um arquivo do tipo `relatorio-acessos-completo-AAAAMMDD.xlsx` na aba Todos, ou `relatorio-acessos-sem-saida-AAAAMMDD.xlsx` na aba Sem saída. Enquanto gera, o botão mostra **Exportando...**.

---

## Recusas de acessos

**Para que serve.** Ver por que um acesso foi recusado, em acesso de serviço, credenciamento de evento ou credencial.

**Quem usa.** Quem tem permissão de **Visualizar** Recusas de acessos.

**Onde fica.** Menu **Relatórios → Recusas de acessos** (`/operacao/negacoes-credenciamento`). O cartão **Negativas (7 dias)** do Início aponta para cá; o filtro de datas é que restringe o período.

Subtítulo: **Consulte as recusas registradas em todos os módulos (até 500 registros mais recentes).**

### Filtros

- **Módulo:** Todos os módulos, Acesso de serviço, Credenciamento de evento, Credencial
- **Evento**
- **Data inicial** e **Data final**
- **Limpar**

Não há exportação nesta tela. Use **Atualizar** para recarregar.

### Colunas

Data e hora, módulo, colaborador, documento, contexto, empresa, status na negação e motivo.

O motivo é o texto registrado no momento da recusa (bloqueio, fora do horário, reprovação, documento, facial e outros). Não há uma lista fechada de motivos na tela.

Lista vazia: **Nenhuma negação encontrada.** O rodapé lembra o limite de 500 registros mais recentes.

### O que fazer com uma recusa

Este relatório só consulta. Para liberar de novo, trate a causa no módulo de origem: tirar da **Gestão de bloqueio**, ajustar o horário do acesso de serviço, ou pedir nova aprovação.

---

## Relatório de mercadorias

**Para que serve.** Ver o saldo atual por produto e local, o fluxo dos últimos sete dias e o histórico de entradas e saídas.

**Quem usa.** Quem tem permissão de **Visualizar** Relatório de mercadorias.

**Onde fica.** Menu **Relatórios → Relatório de mercadorias** (`/admin/mercadorias/relatorios`).

Subtítulo: **Estoque atual, fluxo de entradas/saídas e histórico de movimentações.**

### Indicadores

- **Entradas (7 dias)** e **Saídas (7 dias)**
- Gráfico **Entradas vs saídas por dia**

### Consultar estoque

Botão **Atualizar**. Colunas: produto, local, tipo (**Loja** ou **Depósito**), unidade e saldo.

Lista vazia: **Nenhum saldo em estoque.** Entregas e encomendas que só passam pela portaria não montam esta tabela de saldo.

### Histórico

Filtro **Todos os tipos**, **Entrada** ou **Saída**.

Colunas: data, tipo, número da NF, agente (com **Credenciada** ou **Eventual**), motorista, placa, fotos (**N foto(s)** abre em nova aba) e itens no formato produto, local, quantidade e unidade.

São exibidos até 50 registros por página, com **Exibindo X de Y registro(s)**. Não há exportação nesta tela.

---

## Auditoria

**Para que serve.** Saber quem consultou, entrou ou alterou algo no sistema, e exportar essa trilha.

**Quem usa.** Quem tem permissão de **Visualizar** Auditoria. É uma consulta de operação e conformidade, com o nome da pessoa responsável.

**Onde fica.** Menu **Relatórios → Auditoria** (`/operacao/auditoria`).

Subtítulo: **Consulte todas as consultas, logins e alterações feitas no sistema, com o usuário responsável.**

Há outra tela, em **Configurações → Relatórios do sistema**, voltada a erro técnico da aplicação. As duas não se substituem. O uso por pessoas fica aqui.

### Filtros

- **Módulo** — lista com nomes de tela (Mercadorias, Portaria, Autenticação, Relatórios operacionais e outros)
- **Ação** — Listar, Visualizar, Criar, Atualizar, Excluir, Login, Login Microsoft, Login falhou, Logout, Exportar, Aprovar, Reprovar, Ativar, Desativar e outras
- **Usuário** — nome ou e-mail
- **Data inicial** e **Data final**
- **Limpar**

### Colunas

Data e hora (com segundos), usuário (nome e e-mail), ação, módulo, recurso (tipo, identificador e nome), resultado (**Sucesso**, **Falha** ou traço) e **Detalhes**.

A paginação usa **Anterior** e **Próxima**, com **Página X de Y**.

### Detalhes de um registro

**Detalhes** abre data, usuário, IP, cliente, recurso, identificador do pedido e a chamada (método, caminho e status). Quando houve mudança de dados, os painéis **Antes** e **Depois** mostram o que mudou. **Fechar** volta à lista.

### Exportar

**Exportar Excel** gera `auditoria-AAAAMMDD.xlsx` com o filtro atual.

### O que fica registrado

Consultas (listar e visualizar), entradas e saídas de sessão (login, login Microsoft, falha de login e logout) e alterações (criar, atualizar, excluir, ativar, desativar, aprovar, reprovar, exportar), nos módulos do sistema.
