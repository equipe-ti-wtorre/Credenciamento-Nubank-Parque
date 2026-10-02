# Acessos

Este grupo reúne quem entra na arena: a portaria no dia, o pedido de serviço, o evento da produtora, o credenciamento com pulseira e a lista de bloqueio.

---

## Portaria

**Para que serve.** Liberar, registrar entrada e saída e encerrar o acesso de quem foi aprovado para o dia. A leitura de código e o reconhecimento facial apoiam a operação; a lista permite fazer o mesmo manualmente.

**Quem usa.** Quem tem permissão de **Visualizar** o módulo Portaria. As ações de liberar, dar entrada, saída e baixa aparecem conforme o status da pessoa e a permissão de editar.

**Onde fica.** Menu **Acessos → Portaria** (`/portaria`).

### O que a tela mostra

Três contextos no topo:

| Aba | Conteúdo |
|-----|----------|
| Patrimonial | Acessos de serviço aprovados para hoje |
| Eventos | Credenciais de evento aprovadas para o dia operacional |
| Calendário | Mês com shows, jogos, montagem, desmontagem e serviços |

Ações gerais: **Atualizar lista** e **Tela cheia** / **Sair da tela cheia**.

Há um campo de **Leitura de código de acesso** para o leitor da portaria. O retorno na tela é **Acesso autorizado** ou **Acesso negado**, com o motivo.

#### Filtros

Nas abas Patrimonial e Eventos:

- Busca por nome, documento ou empresa. Em Eventos, a busca também considera o evento.
- Situação: **Todos**, **Aguardando**, **Acessos** (quem está dentro) e **Concluídos**, cada uma com contador.
- Em Patrimonial, um filtro extra separa **Todos**, **Veículos** e **Colaboradores**.
- Em Patrimonial, o botão **Liberação manual** abre um pedido extraordinário para o setor.

#### Lista do dia

**Eventos:** identificação, empresa, evento, status/entrada e ações. Se não houver ninguém: **Nenhuma credencial aprovada para o dia operacional atual.**

**Patrimonial:** identificação, empresa com a finalidade, dias de acesso, aprovado por, status/entrada e ações. Se não houver ninguém: **Nenhum serviço patrimonial aprovado para hoje.**

A legenda dos dias no patrimonial usa **Acessou**, **Não acessou**, **Aguardando**, **Sem acesso no dia** e **Hoje**.

#### Status da linha

| Status | Significado |
|--------|-------------|
| Aguardando | Ainda não liberado para entrar |
| Acesso liberado | Facial liberado; a pessoa ainda não entrou |
| Acessou | Dentro do parque, com horário de entrada |
| Período expirado | O período acabou e a pessoa ainda está dentro |
| Concluído | Entrada e saída encerradas |
| Bloqueado | Está na lista de bloqueio |
| Liberação pendente | O setor ainda não aprovou (patrimonial) |
| Reprovado | Acesso negado na aprovação |
| Saída pendente | Entrou e a saída não foi registrada |
| Fora do horário | Fora da janela comercial, noturna ou manual daquele acesso |

### Liberar o facial (evento ou colaborador)

1. Na linha em **Aguardando**, clique em **Liberar acesso**.
2. O assistente **Conferir documento e liberar o facial** tem três etapas: **Documentos**, **Foto** e **Liberação**.
3. Confira o documento, a foto e conclua a liberação.

O status passa a **Acesso liberado**. Na catraca, o facial passa a reconhecer a pessoa. Se o envio falhar, use o ícone de **Reenviar acesso facial**.

Para veículo patrimonial, a ação equivalente de entrada é **Entrada**.

### Registrar saída e baixa

- **Saída** — registra que a pessoa ou o veículo deixou o parque. O status vai para **Concluído** quando o ciclo fecha.
- **Baixa** — **Registrar baixa manual e remover o facial**. Use quando a saída não pôde ser lida normalmente e é preciso tirar o facial da pessoa.

Uma linha **Concluído** não oferece nova ação de entrada.

### Substituir colaborador

1. Na linha do evento, clique em **Substituir**.
2. No painel **Substituir colaborador**, escolha o tipo de documento (CPF ou passaporte), informe o documento e clique em **Buscar**.
3. Confirme com **Confirmar substituição**.

Se a pessoa buscada estiver na lista de bloqueio, a troca não é confirmada. A mensagem indica **Colaborador na lista de bloqueio**.

### Autorizantes e aviso ao setor

Na lista patrimonial:

- O ícone de telefone abre **Autorizantes do setor**, com ramal, telefone e e-mail de quem responde pelo setor.
- Em **Liberação pendente**, **Notificar o setor** reenvia o aviso para quem aprova.

Bloqueio e **Fora do horário** aparecem só como informação: a portaria não libera esses casos por esse botão.

### Liberação manual

Use quando a pessoa não está na lista do dia e o setor precisa autorizar na hora.

1. Clique em **Liberação manual**.
2. O painel explica: **Solicite aprovação do setor para liberar a entrada de colaboradores.**
3. **Dados:** empresa, setor aprovador, nome do evento e descrição do serviço (obrigatória).
4. **Colaboradores:** busque alguém já cadastrado ou cadastre na hora (nome, documento, tipo, função).
5. **Confirmar** envia o pedido para aprovação.

A pessoa só entra na operação da portaria depois que o setor aprovar. A decisão também aparece em **Aprovações**.

### Calendário

1. Abra a aba **Calendário**.
2. Navegue o mês ou volte com **Hoje**.
3. A legenda distingue **Show**, **Jogo**, **Montagem / Desmontagem**, **Serviço** e **Ao vivo hoje**.
4. O painel **Próximos** marca **Ao vivo hoje** e **Em breve**.
5. Clique no dia ou no item para ver período, empresa, departamento, colaboradores e veículos.

### O que acontece em seguida

Cada entrada e saída alimenta o **Relatório de acessos** e os cartões **Acessos hoje** e **Dentro agora** do Início. Uma recusa na leitura fica em **Recusas de acessos**. Se o evento tiver **Alerta portaria** ligado, a entrada de um colaborador dispara aviso no Teams.

---

## Acessos de Serviço

**Para que serve.** Pedir um período de entrada para prestadores e manutenção: colaboradores, veículos, horário e o setor que vai aprovar.

**Quem usa.** Quem tem permissão de **Visualizar** Acessos de serviço. **Criar** libera **+ Novo acesso**. Aprovar na ficha é papel de membro **Aprovador** ou **Gestor** do setor escolhido (ou de um administrador).

**Onde fica.** Menu **Acessos → Acessos de Serviço** (`/admin/acessos-servico`).

### O que a lista mostra

Subtítulo: **Cadastro de acessos com período, finalidade e vínculo de colaboradores e veículos.**

Colunas: evento (finalidade e empresa), período com o horário (Comercial, Noturno ou Manual), setor, solicitante, quantidades de colaboradores e veículos, situação da aprovação e **Habilitado** (**Sim** ou **Não**).

Botões: **Atualizar**, **+ Novo acesso** e, na linha, **Gerenciar**. Quem administra pode **Habilitar** ou **Desabilitar** o acesso.

### Criar um acesso

O assistente tem três passos.

**1. Dados do acesso**

- **Período do acesso**
- **Horário do acesso:** Manual, Comercial ou Noturno (os intervalos Comercial e Noturno vêm de **Configurações → Horários de acesso**)
- **Empresa** (quando o seu perfil escolhe a empresa)
- **Setor aprovador**
- **Nome do evento**
- **Descrição do serviço**
- Marque **Entrada de colaborador** e/ou **Entrada de veículo**

**2. Colaboradores e veículos**

Busque pessoas e veículos já cadastrados, cadastre na hora ou use a importação em lote. Se o sistema achar duplicidade, escolha **Aplicar** ou **Manter**.

Quem está na lista de bloqueio não entra na seleção.

**3. Revisar e enviar**

Confira o resumo e clique em **Enviar para aprovação**.

### O que acontece em seguida

O setor aprovador recebe a solicitação em **Aprovações** e também pode decidir na própria ficha do acesso. Enquanto estiver pendente, a portaria mostra **Liberação pendente** se alguém tentar tratar o caso no dia. Depois de aprovado, colaboradores e veículos liberados aparecem na aba **Patrimonial** da portaria, nos dias do período e dentro do horário.

### Gerenciar um acesso já criado

Abra **Gerenciar**. O cabeçalho mostra o chip de aprovação, período, horário, empresa, setor e solicitante.

- **Editar** altera período, horário, nome do evento, descrição e setor aprovador.
- **Adicionar colaborador** e **Adicionar veículo** incluem gente nova.
- A orientação da tela: inclua ou remova e clique em **Salvar** para gravar e avisar os aprovadores uma única vez.
- Com status pendente, **Aprovar acesso** ou **Reprovar** abrem um comentário. Na reprovação o comentário é obrigatório.

Um link de protocolo (Teams) abre uma visão só de leitura: finalidade, período, empresa, setor, fluxo e listas **Todos**, **Dentro** e **Aguardando**, com **X entraram** e **Y aguardando**.

### Importar planilha

1. Na etapa de pessoas ou no detalhe, abra o envio de arquivo.
2. Baixe o modelo (**Baixar modelo**) ou arraste a planilha (até 5 MB).
3. A aba **Colaboradores** traz documento, tipo, nome, função, RG e telefone. A aba **Veículos** traz placa, marca, modelo, motorista, cor, tipo e observações.
4. Em **Revisar dados**, corrija função, cargo e pulseira e marque as linhas válidas.
5. Confirme **Importar**. O resultado informa colaboradores, veículos e vínculos de motorista.

---

## Eventos

**Para que serve.** Cadastrar o evento da produtora (período, dias de montagem, show, jogo ou desmontagem) e as empresas parceiras que vão credenciar gente.

**Quem usa.** Quem tem permissão de **Visualizar** Eventos, ou quem aprova e por isso enxerga o módulo. Criar e editar dependem das ações **Criar** e **Editar**.

**Onde fica.** Menu **Acessos → Eventos** (`/admin/eventos`).

### Lista

Filtro **Nome** (placeholder **Nome do evento**) e **Limpar**.

Colunas: nome, início, término e status (inclui **Inativo** e a situação da aprovação).

Ações: **Abrir**, **Ativar** / **Desativar** e **Excluir**.

### Criar um evento

**1. Dados do evento**

- Período (início e término no calendário)
- **Nome**
- **Empresa responsável**
- **Setor aprovador**
- **Foto do evento** (JPEG, PNG ou WebP, até 2 MB)

A tela avisa: o setor só é notificado quando a produtora responsável clicar em **Notificar**.

**2. Dias do evento**

Marque os dias como **Montagem**, **Show**, **Desmontagem** ou **Jogo**. **Preencher período** ajuda a repetir o tipo em vários dias. Se nenhum dia for marcado, o credenciamento vale para todos os dias do período.

**3. Revisão**

Confira e clique em **Salvar evento**.

### Ficha do evento

No topo: nome, **Alerta portaria** (receber aviso no Teams quando um colaborador entrar na portaria neste evento), **Editar**, **Notificar**, **Atualizar** e o interruptor **Ativo** / **Inativo**.

Indicadores: **Empresas parceiras**, **Colaboradores cadastrados** e **Veículos cadastrados**.

#### Empresas parceiras

As abas seguem as fases (montagem, show e demais). **Vincular empresa** escolhe a empresa e as **Fases**. **Editar fases** altera isso depois.

Situações típicas da parceira: **Aguardando Empresa Parceira**, **Cadastro em andamento**, **Pronto para notificar**, **Aguardando aprovação** e **Aprovado**.

Ações: **Colaboradores** ou **Ver**, e **Notificar término** quando a fase daquela empresa acaba.

#### Enviar para aprovação

1. A produtora responsável conclui o cadastro da parceira.
2. Clica em **Notificar**.
3. Confirma **Notificar setor de aprovação?**
4. O setor aprovador decide. O status vai de **Aguardando aprovação** para **Aprovado** (ou reprovado, se o setor negar).

A mesma fila também aparece em **Aprovações**, na coluna **Eventos**.

### Colaboradores e veículos do evento

Na empresa parceira, abra **Colaboradores**. O miniassistente segue **Dias e fases** → **Importar** → **Validar e importar**.

Indicação manual:

1. Escolha dias e fases.
2. Busque o colaborador e informe a **Função no evento**.
3. Associe o veículo, se houver.
4. Revise empresa, dias, colaborador e veículo e confirme.

A importação em lote usa o mesmo modelo de planilha, com o rótulo **Importar para o evento**.

As listas finais permitem remover colaborador ou veículo. Um veículo na blocklist da frota é recusado com **Veículo está na blocklist.**

### O que acontece em seguida

Com o evento aprovado e as pessoas indicadas, a portaria enxerga as credenciais na aba **Eventos** no dia operacional. A entrada dispara o alerta do Teams se **Alerta portaria** estiver ligado.

---

## Credenciamento

**Para que serve.** Abrir um credenciamento de show ou jogo: janela em que as empresas indicam pessoas, tipos de pulseira e, quando couber, inscrição de colaboradores internos.

**Quem usa.** Quem tem permissão de **Visualizar** Credenciamento. Usuários internos com a permissão correspondente também entram para se inscrever. Aprovar indicações é papel dos setores participantes.

**Onde fica.** Menu **Acessos → Credenciamento** (`/admin/credenciamento-eventos`).

### Lista

Busca **Buscar por evento** e filtros **Todos**, **Inscrição aberta** e **Encerrados**.

Colunas: evento, tipo (Showday ou Jogo), data, inscrições, indicações e situação.

Situações: **Aguardando empresas**, **Aguardando aprovação**, **Tudo aprovado** e **Encerrado**. O selo **Colaborador Interno** marca credenciamentos com inscrição interna.

Botões: **Tipos de pulseira** (cadastro dos tipos usados nos eventos) e **Novo credenciamento**.

### Criar um credenciamento

**1. Dados do credenciamento**

- **Janela de indicação:** calendário, **Abre às** e **Fecha às**
- **Dias do evento**
- **Nome do evento**
- **Tipo:** Showday ou Jogo
- **Setores participantes**
- **Foto do evento**

**2. Tipos de pulseira**

- **Credenciamento interno** — liga a inscrição de colaboradores internos
- **Foto do colaborador obrigatória**
- Inclua as pulseiras das empresas e, se o interno estiver ligado, as **Pulseiras dos colaboradores internos**

Dá para cadastrar um tipo novo na hora; ele já entra habilitado neste evento.

**3. Revisar**

Clique em **Criar credenciamento**.

Cada setor participante indica as empresas e o convite segue por e-mail. A empresa vê o prazo **A empresa pode indicar até …**.

### Ficha do credenciamento

Dá para ajustar nome, foto, janela, dias, pulseiras e setores.

**Colaboradores internos:** inscrição, aprovação, **Aplicar pulseira** e bloqueio da linha.

**Empresas por setor:**

- **Adicionar empresas**
- **Importar planilha** — indique colaboradores da empresa, revise e confirme
- Indicar colaborador com função e pulseira
- Filtrar por função ou pulseira
- **Aprovar empresa**, aprovar ou reprovar linhas, bloquear
- **Concluir** e **Notificar** quando a indicação do setor estiver pronta para a decisão

### Inscrever-se (colaborador interno)

A página **Inscrição no evento** (também aberta pelo Teams) mostra o evento.

1. Se a janela estiver aberta e o credenciamento interno estiver habilitado, escolha a pulseira.
2. Confirme a inscrição.
3. A seção **Sua inscrição** mostra o que foi pedido.
4. Enquanto estiver pendente, **Cancelar inscrição** desfaz o pedido.

Se a janela fechou ou o credenciamento não está aberto para internos, a tela explica o motivo e não oferece o botão.

### O que acontece em seguida

Empresas aprovadas e internos aprovados viram credenciais do dia na **Portaria → Eventos**. Quem foi reprovado ou bloqueado não é liberado. A decisão também pode ser tratada na coluna **Credenciamento** de **Aprovações**, inclusive a troca de pulseira antes de confirmar.

O aviso automático para usuários internos, quando um credenciamento interno é criado, é controlado em **Configurações → Notificações de credenciamento**.

---

## Gestão de bloqueio

**Para que serve.** Impedir o acesso de um colaborador à arena por um prazo, por uma quantidade de eventos ou de forma permanente.

**Quem usa.** Quem tem permissão de **Visualizar** Gestão de bloqueio. Criar, editar prazo e remover dependem de **Criar**, **Editar** e **Excluir**.

**Onde fica.** Menu **Acessos → Gestão de bloqueio** (`/admin/gestao-bloqueio`).

O bloqueio de **veículo** não é feito nesta tela. Ele fica na **Frota**, na ação **Adicionar à blocklist**, e impede credenciamento e portaria daquela placa.

### O que a lista mostra

Subtítulo: **Impede o acesso do colaborador à arena por prazo, por eventos ou de forma permanente.**

Filtros: **Nome ou documento**, tipo (**Todos**, **Permanente**, **Por dias**, **Por eventos**) e **Limpar**.

Colunas: colaborador, documento, prazo (tipo e tempo restante), motivo e quem incluiu.

Ações: **Editar prazo** e **Remover bloqueio**.

### Bloquear um colaborador

1. Abra o formulário de novo bloqueio.
2. Busque o **Colaborador**. Se ele já estiver bloqueado, a tela avisa.
3. Escreva o **Motivo** com pelo menos 10 caracteres.
4. Escolha o **Período de bloqueio**:
   - **Permanente**
   - **Por dias** — informe a quantidade
   - **Por eventos** — informe a quantidade de eventos
5. Clique em **Bloquear colaborador**.

Para ajustar um bloqueio existente, use **Editar prazo** e **Salvar bloqueio**.

### O que acontece em seguida

- Na portaria, a linha fica **Bloqueado**, com o motivo.
- A substituição de colaborador na portaria recusa essa pessoa.
- Buscas de acesso de serviço e de evento não permitem incluir quem está bloqueado.
- O Início passa a contar a pessoa em **Blocklist PF**.
- **Remover bloqueio** devolve a pessoa ao fluxo normal de credenciamento e portaria. O cadastro em **Colaboradores** continua existindo; a tela de colaborador apenas informa **Na lista de bloqueio** e aponta para este módulo.
