# Primeiros passos

## Entrar no sistema

**Para que serve.** Identificar quem está usando a plataforma e abrir somente os módulos permitidos ao seu time.

**Quem usa.** Qualquer pessoa com conta ativa: usuário interno (Microsoft ou senha local) ou usuário de empresa.

**Onde fica.** Tela de entrada, endereço `/login`. O título da página é **Credenciamento**.

### Entrar com Microsoft

Este é o caminho principal para quem tem conta corporativa.

1. Abra a tela de login.
2. Clique em **Entrar com Microsoft**.
3. Conclua o login na janela da Microsoft.
4. A plataforma abre o **Início** (`/dashboard`), ou a página que você tentou acessar antes de entrar.

Se o diretório Microsoft ainda não estiver cadastrado, a tela avisa que a configuração está pendente. Nesse caso, um administrador precisa concluir **Configurações → Tenants Azure** antes do login Microsoft funcionar.

### Entrar pelo Microsoft Teams

Quando a plataforma abre de dentro do Teams, ela tenta usar a conta já conectada.

- Mensagens como «Abrindo com sua conta Microsoft do Teams…» ou «Concluindo autenticação Microsoft…» indicam que o acesso automático está em andamento.
- Se o automático falhar, use **Entrar com Microsoft (Teams)** ou **Entrar com Microsoft**.

Um link recebido no Teams (aprovação ou acesso de serviço) leva direto àquela solicitação depois do login.

### Entrar com e-mail e senha

O formulário de senha fica oculto até você pedir.

1. Clique em **Login sem Microsoft**.
2. Informe **E-mail** e **Senha**.
3. Clique em **Entrar**. Enquanto processa, o botão mostra **Processando...**.
4. Para esconder o formulário de novo, clique em **Ocultar login admin**.

Se a senha estiver errada, aparece **Falha na autenticação**. Se houver muitas tentativas seguidas, a mensagem **Muitas tentativas** pede para aguardar alguns minutos.

### O que acontece em seguida

Você entra na área interna. O menu lateral lista só os módulos do seu time. Se já estava autenticado e abrir de novo a tela de login, o sistema segue direto para o destino, em geral o **Início**.

---

## Definir senha pelo convite de acesso

**Para que serve.** Concluir o cadastro de um usuário que recebeu um e-mail de acesso, sem passar pelo administrador.

**Quem usa.** A pessoa indicada no convite (gestor de empresa ou usuário convidado).

**Onde fica.** Link do e-mail, endereço `/cadastro-acesso`. O convite padrão vale **72 horas**. O texto do e-mail pode ser alterado em **Configurações → Templates de e-mail**.

### Passo a passo

1. No e-mail, clique em **Definir senha e acessar**.
2. Aguarde **Validando convite...**.
3. Confira os dados somente leitura: **Nome**, **E-mail** e, quando existirem, **Empresa** e **Perfil**.
4. Crie a **Senha** (mínimo de 8 caracteres) e repita em **Confirmar senha**.
5. Clique em **Definir senha e entrar**.

A mensagem **Acesso criado com sucesso.** abre o **Início**.

### Se o link não funcionar

- Sem o código do convite: **Link de cadastro inválido. Solicite um novo envio de acesso.**
- Convite vencido ou já usado: **Convite inválido ou expirado.**
- Use **Ir para o login** e peça um novo envio em **Usuários de empresas** (**Reenviar convite**) ou em **Empresas** (**Enviar acesso**).

---

## Cadastrar a empresa pelo link

**Para que serve.** A própria empresa informa CNPJ, razão social, contato e senha, a partir de um convite enviado pela administração.

**Quem usa.** O responsável que recebeu o e-mail **Cadastrar empresa**.

**Onde fica.** Link do e-mail, endereço `/cadastro-empresa`. O convite padrão vale **72 horas**.

A tela mostra três etapas de orientação:

1. Cadastre a empresa e o contato responsável.
2. Inclua os colaboradores que vão acessar o parque.
3. Acompanhe a aprovação e a liberação do acesso.

### Passo a passo

1. Abra o link e aguarde **Validando convite...**.
2. Em **Dados da empresa**, preencha:
   - **CNPJ** (obrigatório)
   - **Razão social** (obrigatório)
   - **Nome fantasia** (obrigatório)
   - **Logo** (opcional): PNG, JPEG ou WebP, até 2 MB
3. Em **Contato responsável**, preencha:
   - **Nome completo** (já vem do convite)
   - **Departamento** (opcional)
   - **E-mail** (somente leitura — é o login)
   - **Telefone** (obrigatório)
4. Em **Senha de acesso**, crie uma senha com no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo. O medidor indica o que ainda falta. Repita a senha.
5. Clique em **Cadastrar empresa**.

A mensagem **Empresa cadastrada com sucesso.** abre o **Início**. Quem já tem conta pode usar **Já tem cadastro? Entrar no portal**.

### O que acontece em seguida

A empresa passa a existir no cadastro. Colaboradores e veículos são incluídos depois, nos módulos **Colaboradores**, **Frota** ou dentro de um acesso de serviço / credenciamento. A liberação na portaria só ocorre depois que um setor aprovar a solicitação correspondente.

---

## Conhecer a área interna

Depois do login, a tela se divide em menu lateral, barra superior e conteúdo.

### Menu lateral

- O **logo** no topo volta ao **Início**.
- **Recolher menu** / **Expandir menu** deixa só os ícones. A escolha fica salva neste navegador.
- Abaixo do logo aparecem sua foto (conta Microsoft) ou as iniciais, o nome e o perfil.
- Os grupos (**Geral**, **Acessos**, **Mercadorias**, **Relatórios**, **Cadastros**, **Sistema**) abrem e fecham ao clicar no título. Essa preferência fica salva para o seu usuário. O grupo da página atual abre sozinho.
- Com o menu recolhido, os ícones de todos os itens continuam visíveis. Passe o mouse para ler o nome.
- **Aprovações** mostra um número quando há pendências que você pode ver. O número some quando chega a zero.
- **Sair**, no final do menu, encerra a sessão e volta ao login. Enquanto sai, o botão mostra **Saindo...**.

Um gestor de setor sem outros cadastros pode ver o grupo **Gestão** apenas com **Times**.

### Barra superior

- O título grande é o nome da tela atual (Início, Empresas, Portaria…).
- **Busca** aparece para quem pode ver Empresas e/ou Colaboradores. Digite pelo menos 2 caracteres. Os resultados se separam em **Empresas** e **Colaboradores**. Escolher um resultado abre a lista correspondente.
- O **sino** abre **Alertas**. Dá para **Marcar todas como lidas**, **Limpar todas as mensagens** ou **Excluir** um alerta. Se não houver nada, a mensagem é **Nenhum alerta no momento.**

### Listas no dia a dia

Na maior parte das listas:

- Digitar em um campo de texto já filtra, depois de um instante. Não há botão **Filtrar**.
- Listas e datas filtram na hora.
- **Limpar** devolve os filtros ao padrão.
- Ações da linha ficam no ícone de editar e no menu de três pontos. **Excluir** costuma ser o último item, em vermelho, e pede confirmação.

---

## Sessão por inatividade

**Para que serve.** Encerrar o acesso de quem deixou o navegador aberto sem usar.

**Quem define o tempo.** Um administrador, em **Configurações → Sessão**. O padrão é **30 minutos** sem mouse, teclado, toque ou rolagem. O intervalo permitido é de 5 a 480 minutos. Um usuário interno pode ter tempo próprio ou a regra desligada; isso é configurado em **Usuários internos**, não pelo próprio usuário.

**O que você vê.** Não há aviso antes. A sessão termina e a tela de login mostra:

> Sua sessão expirou por inatividade. Faça login novamente.

Entre de novo com Microsoft ou com e-mail e senha.
