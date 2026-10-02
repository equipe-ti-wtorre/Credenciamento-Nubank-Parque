# Configurações

**Para que serve.** Ajustar integrações e regras que valem para toda a plataforma: login Microsoft, e-mail, facial, aparência, Teams, sessão e horários.

**Quem usa.** Quem enxerga **Sistema → Configurações**. Cada item interno ainda depende da permissão de **Visualizar** daquele ajuste. Salvar exige **Editar**.

**Onde fica.** Menu **Sistema → Configurações** (`/admin/configuracoes`). O menu claro desta área é separado do menu escuro principal.

Itens, na ordem da tela:

| Item | Uso |
|------|-----|
| Tenants Azure | Diretório para o login Microsoft |
| Envios de e-mail | Provedor e histórico de mensagens |
| Integração facial | Ligação com o leitor da portaria |
| Templates de e-mail | Assunto e texto dos e-mails automáticos |
| Sessão | Tempo sem uso até pedir login de novo |
| Aparência | Paleta WTorre ou Nubank Parque |
| Integração Teams | Avisos no sino ou em canal |
| Relatórios do sistema | Trilha técnica e erros da aplicação |
| Sobre | Versão e se o sistema está no ar |
| Notificações de credenciamento | Quem avisa quando nasce um credenciamento interno |
| Horários de acesso | Janelas Comercial e Noturno |

---

## Tenants Azure

**Para que serve.** Cadastrar o diretório Microsoft usado no **Entrar com Microsoft** e nas integrações.

**Onde fica.** **Configurações → Tenants Azure**.

A tela **Status Tenants Azure** resume total, ativos, conectados e com erro. Cada cartão mostra nome, identificador do diretório e a situação: **Conectado**, **Erro**, **Inativo** ou **Pendente**. Selos possíveis: **Principal (MSAL)**, **Ativo** / **Inativo** e **Sem secret**.

A tabela **Detalhes cadastrais** repete nome, identificadores e status. **Atualizar status** testa de novo. **+ Novo tenant** abre o cadastro.

### Novo tenant

1. Clique em **+ Novo tenant**.
2. O subtítulo é **Cadastre credenciais Azure AD para autenticação e integrações.**
3. Informe **Nome**, **Azure Tenant ID**, **Client ID** e **Client Secret**.
4. Marque **Ativo**. Marque **Tenant principal (MSAL)** no diretório que o login deve usar.
5. Clique em **Criar tenant**. Na edição, o botão é **Salvar tenant**. Se o segredo ficar vazio na edição, o anterior é mantido.

### Situações que a tela explica

- **Tenant desativado — não participa dos testes de conexão.**
- **Client secret não configurado.**
- **Aguardando diagnóstico de conexão.**
- **Conexão com Microsoft Graph validada.**
- Lista vazia: **Nenhum tenant cadastrado. Clique em Novo tenant para começar.**

No menu da linha: **Ver diagnóstico**, **Copiar Tenant ID** e **Desativar**. Desativar pede confirmação **Desativar tenant?**

### O que acontece em seguida

Com um tenant ativo, principal e conectado, o botão **Entrar com Microsoft** passa a autenticar. **Importar do Azure AD** em Usuários internos usa esse diretório. Sem tenant, o login Microsoft avisa que a configuração está pendente.

---

## Envios de e-mail

**Para que serve.** Escolher por onde os convites e avisos saem, e consultar se cada mensagem foi enviada.

**Onde fica.** **Configurações → Envios de e-mail**.

Abas: **Configuração** e **Histórico**.

### Configuração

Escolha o **Provedor**: **SMTP**, **Azure ACS** ou **SendGrid**.

Opções comuns:

- **Envio de e-mail ativo**
- **Ocultar e-mail do destinatário no campo Para (envia só em Cco)**

**SMTP:** host, porta, **TLS/SSL (secure)**, usuário, senha, e-mail remetente, nome remetente e **Configuração SMTP ativa**. **Verificar SMTP** testa a conexão sem mandar mensagem.

**Azure ACS:** connection string e remetente de domínio verificado.

**SendGrid:** chave de API, e-mail remetente verificado, nome e chave de verificação do webhook de eventos.

Senha ou chave já gravada aparece mascarada. Deixar o campo vazio na edição mantém o valor anterior.

**Salvar configuração** grava. **Testar envio** abre **Testar envio de e-mail**: informe o **E-mail destino** e clique em **Enviar teste**.

### Histórico

Filtros: busca (destinatário, assunto, identificador ou erro), status (**Todos**, **Enviado**, **Entregue**, **Falhou**, **Bounce**) e provedor. **Limpar filtros** e **Atualizar**.

Colunas: data, destinatário, assunto, provedor, status, identificador da mensagem e erro.

Lista vazia: **Nenhum envio registrado.** ou **Nenhum envio encontrado com esses filtros.**

### O que acontece em seguida

Convites de empresa, definição de senha e avisos de credenciamento passam a usar esse provedor. O texto de cada mensagem continua em **Templates de e-mail**.

---

## Integração facial

**Para que serve.** Ligar a portaria ao leitor facial, para que **Liberar acesso** envie a foto e a baixa retire a pessoa do leitor.

**Onde fica.** **Configurações → Integração facial**.

Subtítulo: **HTTP poll (recomendado): o Gateway busca jobs neste servidor. Azure Service Bus é opcional.**

Abas: **Configuração** e **Logs**.

### Configuração

- **Integração facial ativa**
- Transporte, somente leitura: **HTTP poll (Gateway busca jobs)** ou **Azure Service Bus**
- **URL do Credenciamento** — informe este endereço no Gateway
- **Secret compartilhado (Bearer)** — o mesmo valor configurado no Gateway. A tela mostra o segredo; a troca dele é feita fora desta página
- **IP de origem (Gateway)** e **IP de destino (Credenciamento)** — a troca fica restrita a esses dois endereços

A seção **Service Bus (opcional / Azure)** guarda filas e connection strings, e oferece **Limpar connection strings Azure (voltar ao HTTP poll)**.

**Salvar configuração** grava. Se a integração estiver ativa sem o segredo, a tela avisa **Secret ausente** e pede para definir o segredo no servidor e reiniciar o processo.

**Testar sync** confere a ligação. **Forçar sync** pede confirmação: reenvia o cadastro facial de todos os colaboradores ativos com foto, exceto blocklist. Jobs já na fila da mesma pessoa são substituídos. Resultados possíveis: **Sync ok**, **Sync com avisos**, **Sync com problemas** ou **Sincronização já em andamento. Aguarde a conclusão.**

O painel **Status operacional** mostra integração ativa ou inativa, configuração completa ou incompleta, o transporte, contadores de cadastro facial (sincronizado, pendente, falha) e acessos das últimas 24 horas (total e bloqueados).

### Logs

Subabas **Enrollment** e **Acesso**, com **Refresh ativo** / **Ativar refresh** e os **Últimos 24 registros**. **Atualizar** busca de novo.

### O que acontece em seguida

Na portaria, **Liberar acesso** e **Reenviar acesso facial** passam a falar com o leitor. **Baixa** remove o facial. Pessoa sem foto válida ou na blocklist não entra nesse envio.

---

## Templates de e-mail

**Para que serve.** Ajustar assunto e corpo dos e-mails automáticos (convite, cadastro da empresa e demais avisos).

**Onde fica.** **Configurações → Templates de e-mail**.

Subtítulo: **Edite o HTML e o assunto dos e-mails enviados pelo sistema. Use placeholders `{{variavel}}`.**

À esquerda, a lista **Templates** com nome, código e **Ativo** / **Inativo**. À direita, o editor.

Campos: **Nome**, **Template ativo**, **Assunto**, botões de **Variáveis** (cada `{{chave}}` entra no campo que estiver em foco), **Corpo HTML** e **Corpo texto** (opcional, versão simples do e-mail).

A tela avisa: no HTML, os valores das variáveis são tratados no envio para não quebrar a mensagem.

**Preview** mostra o resultado. **Enviar teste** pede um e-mail válido. **Salvar template** grava. Sem assunto ou HTML: **Campos obrigatórios** — **Informe assunto e corpo HTML.**

Lista vazia: **Nenhum template encontrado.** Sem seleção: **Selecione um template à esquerda.**

### O que acontece em seguida

O próximo convite ou aviso usa o assunto e o HTML salvos. Um template **Inativo** deixa de ser enviado.

---

## Sessão

**Para que serve.** Definir depois de quantos minutos sem uso a pessoa volta à tela de login.

**Onde fica.** **Configurações → Sessão**.

Subtítulo: **Defina após quanto tempo sem interação o usuário deve fazer login novamente.**

Campo **Encerrar sessão após (minutos sem atividade)**. O valor fica entre 5 e 480. O padrão é 30. Fora da faixa: **Valor inválido** — **Informe um número entre 5 e 480.**

**Salvar** responde **Configuração de sessão salva.**

Não há aviso na tela da pessoa antes de sair. A mensagem aparece no login: **Sua sessão expirou por inatividade. Faça login novamente.**

Uma exceção por usuário interno (padrão, personalizado ou desativado) é feita em **Usuários internos**, no campo **Logout por inatividade**.

---

## Aparência

**Para que serve.** Escolher a paleta de cores de todo mundo.

**Onde fica.** **Configurações → Aparência**.

Subtítulo: **Escolha a paleta de cores padrão do sistema. A alteração vale para todos os usuários.**

Dois cartões:

| Paleta | Descrição na tela |
|--------|-------------------|
| WTorre | Azul institucional (padrão atual). |
| Nubank Parque | Core Purple com herança verde. |

Clicar no cartão já mostra a prévia. **Salvar paleta** confirma para todos. Se nada mudou, o botão fica desabilitado. Sair sem salvar devolve a paleta anterior.

O login, o menu e os botões passam a usar a paleta salva. Os nomes das telas e os fluxos permanecem os mesmos.

---

## Integração Teams

**Para que serve.** Enviar aviso ao sino do Teams de uma pessoa ou a um canal, por exemplo na entrada de um colaborador quando o evento tem **Alerta portaria**.

**Onde fica.** **Configurações → Integração Teams**.

Subtítulo: **Envie notificações ao feed de atividades do usuário no Teams (sino) ou a um canal.**

A orientação da tela pede o aplicativo publicado e instalado para todos no administrador do Teams, com permissão para enviar atividade e ler usuários.

A tabela lista nome, tipo (**Usuário** ou **Canal**), tenant, destino, identificador do aplicativo, **Ativo** (**Sim** / **Não**) e ações.

### Nova integração

1. Clique em **+ Nova integração**.
2. Informe **Nome**, **Tipo de notificação** e **Tenant Azure**. Deixe **Ativo** ligado.
3. Tipo **Usuário:** e-mail do destinatário de teste, URL ao clicar (precisa começar com `https://`) e o identificador do aplicativo no Teams.
4. Tipo **Canal:** **Team ID** e **Channel ID**.
5. Clique em **Criar integração**. Na edição, **Salvar alterações**.

A tela recusa tenant vazio, e-mail vazio, URL sem `https://`, aplicativo sem identificador ou canal sem os dois identificadores.

**Desativar** pede **Desativar integração?** O teste **Testar notificação ao usuário** pede o e-mail de destino.

### O que acontece em seguida

Com a integração ativa, os alertas de portaria e os links de aprovação passam a chegar no Teams. O destinatário abre a solicitação já na ficha correspondente.

---

## Relatórios do sistema

**Para que serve.** Consultar a trilha técnica e os erros da aplicação, e exportar o filtro em Excel.

**Quem usa.** Administração da plataforma. Para saber o que uma pessoa fez no dia a dia (login, aprovação, alteração), use **Relatórios → Auditoria**.

**Onde fica.** **Configurações → Relatórios do sistema**.

Subtítulo: **Consulte logs de auditoria e erros da aplicação. Exporte os registros filtrados em Excel.**

Abas: **Auditoria** e **Erros do sistema**.

**Auditoria:** filtros de módulo, ação, identificador numérico do usuário e datas. As colunas são técnicas (identificador do usuário, identificador do pedido). **Ver** abre o detalhe.

**Erros do sistema:** módulo, nível (**Todos**, erro ou aviso), status HTTP e datas. **Ver** inclui a pilha do erro.

**Limpar** zera o filtro. **Atualizar** recarrega. **Exportar Excel** baixa o resultado. Não há botão de salvar: a tela só consulta.

---

## Sobre

**Para que serve.** Conferir se a plataforma e o banco estão respondendo, e qual versão está no ar.

**Onde fica.** **Configurações → Sobre**.

Título **Credenciamento**, subtítulo **Sistema de credenciamento e administração corporativa**.

Campos somente leitura: versão do backend, status da API, banco de dados, versão do frontend e última verificação.

O texto da tela resume que o sistema integra login Microsoft, envio de e-mail e avisos no Teams, e que os ajustes ficam neste menu. Não há botão de salvar.

---

## Notificações de credenciamento

**Para que serve.** Escolher quem recebe o aviso automático quando um credenciamento interno é criado.

**Onde fica.** **Configurações → Notificações de credenciamento**.

O subtítulo pede, em fase de implantação, manter o envio geral desligado e liberar só algumas pessoas.

O interruptor **Notificar todos os usuários AD** manda o aviso para todo o diretório. Desligado, o aviso vai só para a lista ao lado.

Com o interruptor desligado:

1. Em **Usuários AD**, busque por nome ou e-mail.
2. **Incluir**, **Incluir todos** ou **Incluir resultados** passa a pessoa para **Incluídos na whitelist**.
3. **Remover** ou **Remover todos** tira da lista.
4. Clique em **Salvar**.

A nota no rodapé: **O aviso é enviado ao criar um credenciamento interno.**

Estados vazios: **Nenhum usuário encontrado**, **Todos já foram incluídos**, **Nenhum usuário AD** e **Nenhum usuário aqui** — **Inclua os usuários que devem receber o aviso.**

---

## Horários de acesso

**Para que serve.** Definir os intervalos das opções **Comercial** e **Noturno** nos acessos de serviço.

**Onde fica.** **Configurações → Horários de acesso**.

Subtítulo: **Defina os intervalos usados nas opções Comercial e Noturno dos acessos de serviço. Acessos já cadastrados mantêm o horário gravado na época.**

**Comercial:** início e fim no mesmo dia. Padrão citado na tela: 08:00 às 18:00.

**Noturno:** início e **Fim (dia seguinte)**. Padrão citado na tela: 18:00 às 08:00. Se o fim for menor que o início, a janela atravessa a meia-noite.

**Salvar** grava. Mensagens de validação:

- **Valor inválido** — **Informe todos os horários no formato HH:mm.**
- **O horário comercial precisa ter início e fim diferentes.**
- **O horário noturno precisa ter início e fim diferentes.**

### O que acontece em seguida

Novos acessos de serviço que escolherem Comercial ou Noturno usam esses intervalos. A portaria marca **Fora do horário** quando a pessoa chega fora da janela gravada naquele acesso. Quem já tinha um acesso antigo continua com o horário da época em que foi salvo. A opção **Manual** no acesso de serviço informa o horário na própria solicitação e não usa estes dois padrões.
