# Geral

## Início

**Para que serve.** Mostrar, num único painel, como está a operação de acessos no dia: volume, quem está dentro, pendências e cadastros.

**Quem usa.** Quem tem permissão de **Visualizar** o módulo Início. Os números e gráficos carregam para administradores, produtoras e empresas padrão. Outros perfis entram na mesma tela e veem a saudação, sem os indicadores.

**Onde fica.** Menu **Geral → Início** (`/dashboard`).

### O que a tela mostra

No topo: **Bem-vindo, {nome}**, a frase **Aqui está um resumo da operação de acessos de hoje.** e a data por extenso.

Botões:

- **Atualizar** — recarrega os indicadores na hora.
- **Tela cheia** — esconde o menu, útil em monitor de operação. Mostra **Atualizado {hora}**.
- **Sair da tela cheia** — ou a tecla Esc — volta ao layout normal.

Os indicadores também se atualizam sozinhos a cada 30 segundos, enquanto a tela estiver aberta.

Enquanto carrega: **Carregando indicadores...**

#### Cartões principais

| Cartão | O que indica | Ao clicar |
|--------|----------------|-----------|
| Empresas ativas | Empresas com cadastro ativo | Permanece no Início |
| Aguardando aprovação | Credenciais ainda sem decisão (etiqueta **Credenciais**) | Permanece no Início |
| Acessos hoje | Entradas do dia, com comparação em relação a ontem | Permanece no Início |
| Dentro agora | Pessoas ou veículos que entraram e ainda não saíram | Abre o Relatório de acessos |
| Negativas (7 dias) | Recusas dos últimos sete dias; destaca se houver alguma | Abre Recusas de acessos |
| Alertas não lidos | Alertas do sino; pode mostrar a etiqueta **{N} aprovações** | Abre Aprovações |

#### Situação das credenciais

Quatro contadores: **Aprovados**, **Aguardando**, **Negados** e **Expirados**.

O gráfico **Credenciais por status** (subtítulo **Distribuição atual**) mostra a mesma divisão. Se ainda não houver credencial: **Nenhuma credencial registrada até o momento.**

#### Acessos

- **Acessos — Últimos 7 dias:** barras por dia da semana.
- **Origem dos acessos — Hoje:** **Evento**, **Serviço (PF)** e **Serviço (veículo)**.
- Se não houve movimento: **Nenhum acesso registrado nos últimos 7 dias.**

#### Workflow de aprovação

Mostra taxa de decisão e tempo médio, ou **Sem decisões finalizadas**. O link **Inbox →** abre Aprovações.

Contadores: **Pendentes** (com **Suas: {N}**), **Aprovados**, **Reprovados** e **Expiradas**.

#### Cadastros

Volumes no seu escopo: **Colaboradores ativos**, **Veículos ativos**, **Blocklist PF**, **Blocklist veículos** e **Eventos ativos**.

#### Coluna da direita

- Administrador: **Empresas por tipo** ou **Top empresas**, conforme os dados disponíveis.
- Demais perfis: **Pendências rápidas**, com atalhos para Aprovações, Negativas (7 dias) e Dentro agora.

### Passo a passo

1. Abra **Início**.
2. Leia os cartões do dia. Clique nos que têm destino (Dentro agora, Negativas, Alertas) para ir à lista correspondente.
3. Use **Atualizar** se acabou de registrar um acesso na portaria e quer ver o número na hora.
4. Em um monitor fixo, use **Tela cheia**.

---

## Aprovações

**Para que serve.** Decidir solicitações de acesso de serviço, evento e credenciamento que estão na sua fila, e acompanhar o que você enviou ou o que a equipe trata.

**Quem usa.** Quem tem permissão de **Visualizar** o módulo Aprovações. Os botões **Aprovar** e **Reprovar** aparecem na aba **Pendentes para mim**, quando a solicitação ainda está pendente. **Cancelar** aparece em **Minhas solicitações**, na sua própria pendência.

**Onde fica.** Menu **Geral → Aprovações** (`/aprovacoes`). Um link do Teams abre a solicitação direto em `/aprovacoes/{id}`.

O número ao lado do item no menu é a quantidade de pendências visíveis para você.

### O que a tela mostra

Cinco cartões no topo:

- **Pendentes para mim**
- **Acessos de serviço**
- **Eventos**
- **Credenciamento**
- **Total de solicitações**

Três abas, cada uma com contador:

| Aba | O que lista |
|-----|-------------|
| Pendentes para mim | O que espera a sua decisão |
| Minhas solicitações | O que você enviou |
| Solicitações da equipe | Visão da equipe |

Não há campo de busca. A separação é pelas abas e por três colunas de cartões: **Acessos de serviço**, **Eventos** e **Credenciamento**.

Cada cartão mostra tipo e número, setor, título, status, período, solicitante, resumo de colaboradores e veículos (liberados, bloqueados ou **em análise**) e **Criado em {data} às {hora}**.

#### Status no cartão

| Status | Significado |
|--------|-------------|
| Aguardando aprovação | Ainda sem decisão |
| Aprovado | Decisão positiva, sem bloqueio de itens |
| Liberado parcialmente | Aprovado, com algum colaborador ou veículo bloqueado na portaria |
| Reprovado | Decisão negativa |
| Cancelado | O solicitante cancelou |
| Tempo de autorização expirada | O prazo da autorização acabou |
| Pendente | Situação genérica ainda aberta |

A faixa colorida do cartão acompanha o status: âmbar (pendente), verde (aprovado), laranja (parcial), vermelho (reprovado), cinza (demais).

#### Botões do cartão

| Situação | Botões |
|----------|--------|
| Pendente para você | **Aprovar**, **Reprovar**, **Ver detalhes** |
| Sua solicitação ainda pendente | **Cancelar**, **Ver detalhes** |
| Já decidida | **Ver detalhes** |

### Ver detalhes

O painel mostra finalidade ou nome do evento, período, empresa, departamento, observação, setor, solicitante e status.

Tabelas:

- **Colaboradores:** nome, documento, função, pulseira e status (**Aprovado**, **Bloqueado**, **Reprovado** ou **Pendente**).
- **Veículos:** placa, marca/modelo e status.

O **Histórico** lista o que já aconteceu. **Ver detalhes** / **Ocultar detalhes** abre o texto extra de um passo.

No rodapé: **Fechar**. Se a solicitação ainda é sua pendência, também aparecem **Reprovar** e **Aprovar**.

### Aprovar

1. Na aba **Pendentes para mim**, clique em **Aprovar** no cartão ou dentro dos detalhes.
2. Quando houver pessoas ou veículos, marque quem recebe acesso. Use **Liberar todos** ou **Bloquear todos** se quiser aplicar a mesma decisão à lista.
3. Itens desmarcados continuam na solicitação aprovada, mas não recebem credencial na portaria. A tela avisa: **Itens desmarcados são aprovados na solicitação, mas não recebem credencial na portaria.**
4. Em credenciamento pendente, dá para trocar a pulseira antes de confirmar. A confirmação é **Pulseira atualizada.**
5. O **Comentário** é opcional na aprovação.
6. Clique em **Confirmar aprovação**.

A mensagem **Decisão registrada.** atualiza a fila. O solicitante deixa de ver a solicitação como pendente, e a portaria passa a enxergar quem foi liberado no dia do acesso.

### Reprovar

1. Clique em **Reprovar**.
2. O comentário é obrigatório. O campo pede **Informe o motivo da reprovação**.
3. Clique em **Confirmar reprovação**.

A solicitação fica **Reprovado** e não gera entrada na portaria.

### Cancelar a própria solicitação

Na aba **Minhas solicitações**, em um item ainda pendente, clique em **Cancelar**. A mensagem **Solicitação cancelada.** encerra o pedido antes da decisão do setor.

### Página aberta por link

O endereço de uma aprovação específica mostra o mesmo resumo, colaboradores, veículos e histórico, com **Reprovar** e **Aprovar** fixos no rodapé enquanto estiver pendente.

Se alguém já decidiu, a tela avisa que não é possível uma nova decisão. O link **Lista** volta para a fila (fica oculto quando a página abre dentro do Teams).

Um link pode abrir já no painel de aprovar, reprovar ou decidir.
