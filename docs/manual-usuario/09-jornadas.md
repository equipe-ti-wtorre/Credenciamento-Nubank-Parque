# Jornadas

Estes roteiros cruzam vários módulos. Cada tela em detalhe está nos capítulos anteriores. O menu só mostra o passo se o seu time tiver permissão.

---

## Credenciar um evento e liberar na portaria

Use quando uma produtora vai realizar show, jogo, montagem ou desmontagem e as empresas parceiras indicam quem entra.

### Antes de abrir o evento

1. Em **Cadastros → Empresas**, confirme a produtora e as parceiras. Se a parceira ainda não existe, envie **Enviar link de cadastro** ou cadastre com **+ Nova empresa**.
2. Em **Cadastros → Times**, confirme o setor aprovador, com membros **Aprovador** ou **Gestor** e o fluxo **Evento** ligado.
3. Em **Cadastros → Colaboradores**, deixe as pessoas com documento, função e foto. A foto é necessária para o facial na portaria.

### Criar e aprovar

1. Em **Acessos → Eventos**, clique para criar o evento: período, nome, empresa responsável, setor aprovador e foto.
2. Marque os dias (**Montagem**, **Show**, **Desmontagem**, **Jogo**) e salve.
3. Na ficha, ligue **Alerta portaria** se a entrada deve avisar o Teams.
4. **Vincular empresa** em cada fase. A parceira inclui colaboradores e veículos (**Colaboradores** na ficha, indicação manual ou planilha).
5. A produtora clica em **Notificar** e confirma **Notificar setor de aprovação?**
6. O aprovador abre **Geral → Aprovações**, coluna **Eventos**, confere a lista e **Confirmar aprovação**. Quem não deve entrar fica desmarcado: a solicitação pode ser aprovada e essa pessoa não recebe credencial na portaria.

### No dia, na portaria

1. Abra **Acessos → Portaria**, aba **Eventos**.
2. Leia o código ou ache a pessoa na lista. Status esperado: **Aguardando**.
3. **Liberar acesso**: confira documento, foto e conclusão. O status vai para **Acesso liberado**.
4. Na entrada efetiva, a linha passa a **Acessou**. Se o alerta estiver ligado, o Teams recebe o aviso.
5. Na saída, **Saída**. Se o leitor não registrar, **Baixa** remove o facial.
6. Troca de pessoa no mesmo crachá: **Substituir**. A pessoa nova não pode estar na **Gestão de bloqueio**.

### Conferir depois

- **Início:** acessos hoje, dentro agora e credenciais aprovadas.
- **Relatórios → Relatório de acessos:** aba **Sem saída** para quem ainda está no local; **Exportar Excel** se precisar da planilha.
- **Relatórios → Recusas de acessos:** motivo de quem não passou.

### Pelo credenciamento com pulseira

Quando o modelo é indicação por janela e pulseira, o caminho é **Acessos → Credenciamento** em vez da ficha clássica de evento:

1. **Novo credenciamento:** janela (**Abre às** / **Fecha às**), dias, tipo Showday ou Jogo, setores e pulseiras. Ligue **Credenciamento interno** se colaboradores do grupo também se inscrevem.
2. Cada setor **Adicionar empresas** ou importa a planilha e indica função e pulseira.
3. **Aprovar empresa** e as linhas. O aprovador também pode decidir na coluna **Credenciamento** de **Aprovações**, e trocar a pulseira antes de confirmar.
4. O colaborador interno, se a janela estiver aberta, entra em **Inscrição no evento**, escolhe a pulseira e acompanha **Sua inscrição**.
5. No dia, a portaria usa a mesma aba **Eventos**.

---

## Solicitar um acesso de serviço e registrar entrada e saída

Use para prestador, manutenção ou fornecedor com período e horário definidos.

### Preparar

1. Empresa ativa em **Empresas**, com gestor ou solicitante em **Usuários de empresas** se a própria empresa for abrir o pedido.
2. Colaboradores e veículos em **Colaboradores** e **Frota**. Placa e documento corretos evitam bloqueio e duplicidade.
3. Setor com fluxo **Acesso de serviço** ligado e pelo menos um **Aprovador** ou **Gestor**.
4. Se for usar **Comercial** ou **Noturno**, confira os intervalos em **Configurações → Horários de acesso**. A opção **Manual** grava o horário só naquele pedido.

### Pedir

1. **Acessos → Acessos de Serviço → + Novo acesso**.
2. Período, horário, empresa, setor aprovador, nome do evento e descrição do serviço. Marque entrada de colaborador, de veículo ou os dois.
3. Inclua as pessoas e os veículos, ou importe a planilha (**Baixar modelo**, revisar, **Importar**).
4. **Enviar para aprovação**.

### Aprovar

O aprovador do setor abre **Aprovações** (coluna **Acessos de serviço**) ou **Gerenciar** na própria ficha.

- **Aprovar:** marque quem entra. Desmarcar bloqueia aquela pessoa ou placa na portaria e o status pode ficar **Liberado parcialmente**.
- **Reprovar:** comentário obrigatório. Nada aparece para liberar na portaria.
- O solicitante pode **Cancelar** enquanto estiver pendente, em **Minhas solicitações**.

### Na portaria

1. Aba **Patrimonial**, no dia do período e dentro do horário.
2. **Liberar acesso** para colaborador ou **Entrada** para veículo.
3. **Saída** ao deixar o parque.
4. Se o status for **Liberação pendente**, use **Autorizantes do setor** para ligar e **Notificar o setor**. Fora da janela, a linha fica **Fora do horário** e não libera por esse botão.
5. Visita que não estava prevista: **Liberação manual** (empresa, setor, descrição e colaboradores) e espere a aprovação antes de liberar o facial.

### Conferir

**Relatório de acessos**, filtros **Serviço — colaborador** ou **Serviço — veículo**, status **No local** para quem ainda não saiu. O indicador **Ainda no local** é essa mesma conta.

---

## Entrada e saída de mercadoria

Use quando um veículo chega com nota, material de estoque ou encomenda.

### Preparar o cadastro

1. **Mercadorias → Produtos:** descrição e unidade do que entra no estoque.
2. **Mercadorias → Locais de armazenagem:** depósito ou loja de destino.
3. Se o veículo for de prestador conhecido, a placa precisa existir na **Frota**, ligada à empresa. Aí a entrada sai como **Credenciada**.
4. Motorista e ajudantes precisam existir em **Colaboradores**, com CPF, e não podem estar na blocklist.

### Registrar a entrada

1. **Mercadorias → Registrar entrada**.
2. Escolha **Vai para o estoque** (produto, local e NF) ou **Entrega / encomenda** (volumes, descrição e destinatário).
3. Informe a **Placa**. Credenciada: agente, veículo e CPFs. Eventual: remetente, motorista e documentos.
4. No estoque, informe a NF ou marque **Sem nota fiscal** com o motivo, e lance os itens. Na encomenda, volumes e destinatário.
5. Anexe ou tire a **Foto NF**. A leitura preenche número, emitente e itens. Confira o CNPJ se a tela avisar baixa confiança. Item desconhecido: **Cadastrar produto** na hora.
6. **Confirmar entrada**. Mensagem: **Entrada registrada.**

### Revisar remetente eventual

Se a nota criou um remetente novo, abra **Mercadorias → Empresas eventuais**, filtro **Pendentes de revisão**, **Revisar** e **Marcar revisado**. Duplicata: **Unir com outra** informando o identificador do destino.

### Registrar a saída

1. **Mercadorias → Registrar saída**.
2. Repita natureza, placa e itens ou volumes.
3. **Confirmar saída**. Mensagem: **Saída registrada.**

Saída de estoque diminui o saldo do produto naquele local. Encomenda que só passa não altera saldo.

### Conferir

**Relatórios → Relatório de mercadorias:** cartões dos últimos sete dias, tabela de saldo e histórico com fotos da NF. **Atualizar** se o lançamento acabou de ser feito.

---

## Bloquear alguém e ver o efeito na operação

Use quando uma pessoa não pode entrar na arena, por prazo, por quantidade de eventos ou para sempre. Placa de veículo segue outro caminho, na Frota.

### Bloquear a pessoa

1. **Acessos → Gestão de bloqueio**.
2. Busque o colaborador, escreva o motivo (mínimo de 10 caracteres) e escolha **Permanente**, **Por dias** ou **Por eventos**.
3. **Bloquear colaborador**.

### Onde isso aparece

| Lugar | Efeito |
|-------|--------|
| Portaria | Status **Bloqueado**, com o motivo. Não há **Liberar acesso** |
| Substituir colaborador | A busca recusa com **Colaborador na lista de bloqueio** |
| Acesso de serviço e evento | A pessoa não entra na seleção |
| Colaboradores | Selo **Na lista de bloqueio**; o prazo continua sendo editado na Gestão de bloqueio |
| Início | Contador **Blocklist PF** |
| Recusas de acessos | A tentativa negada fica com o motivo da recusa |
| Facial | **Forçar sync** não reenvia quem está na blocklist |

### Bloquear a placa

1. **Cadastros → Frota**, menu da linha, **Adicionar à blocklist**, motivo com pelo menos 10 caracteres.
2. Credenciamento e portaria recusam o veículo (**Veículo está na blocklist.**).
3. **Remover da blocklist** devolve a placa. A confirmação avisa que ela volta a poder acessar a arena.

### Encerrar o bloqueio da pessoa

**Editar prazo** ajusta o período. **Remover bloqueio** devolve a pessoa aos fluxos. O cadastro em Colaboradores não é apagado. Acessos já aprovados passam a considerá-la de novo na próxima inclusão ou liberação; uma credencial antiga recusada não se reabre sozinha — é preciso incluí-la outra vez no acesso ou no credenciamento e aprovar.
