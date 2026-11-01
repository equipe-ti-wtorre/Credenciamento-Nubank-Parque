# Cadastros

Empresas, pessoas, veículos e setores são a base usada por acessos de serviço, eventos, credenciamento e portaria. Criar um cadastro aqui não libera entrada: a liberação vem da aprovação do acesso ou do credenciamento.

---

## Empresas

**Para que serve.** Cadastrar produtoras, empresas padrão e fornecedores, com contatos e convite de acesso.

**Quem usa.** Quem tem permissão de **Visualizar** Empresas. **Criar** e **Editar** liberam o formulário, o convite e a ativação.

**Onde fica.** Menu **Cadastros → Empresas** (`/admin/empresas`).

Subtítulo: **Cadastro de produtoras, empresas padrão e fornecedores vinculados ao credenciamento.**

### O que a lista mostra

Cartões: **Total (página)**, **Ativas** e **Inativas**.

Filtros: **CNPJ** (somente números), **Nome** (razão social ou fantasia), **Tipo** e **Limpar**.

Colunas: logo, razão social, nome fantasia, CNPJ, tipo e status (**Ativa** / **Inativa**).

Lista vazia: **Nenhuma empresa encontrada.**

Ações da linha: **Editar** e, no menu, **Desativar** ou **Ativar**. A confirmação pergunta **Ativar empresa?** ou **Desativar empresa?**

Botões do topo: **Atualizar**, **Enviar link de cadastro** e **+ Nova empresa**.

### Nova empresa

1. Clique em **+ Nova empresa**. O painel traz o subtítulo **Cadastre dados da empresa e contatos vinculados.**
2. Envie o **Logo** se quiser: arraste ou clique para procurar. JPEG, PNG ou WebP, até 2 MB.
3. Escolha o **Tipo**, informe **CNPJ** e **Razão social**. **Nome fantasia** é opcional.
4. Em **Contatos**, use **+ Contato**. Cada contato pede nome (obrigatório), departamento, telefone e e-mail. **Remover** tira o contato da lista.
5. Clique em **Salvar empresa**.

Mensagem: **Empresa criada. Você já pode enviar o acesso.** Na edição, **Salvar alterações** responde **Empresa atualizada.**

### Enviar acesso a um contato já cadastrado

1. Abra **Editar** na empresa.
2. Clique em **Enviar acesso**.
3. O diálogo **Enviar acesso** pede para selecionar o contato que receberá o e-mail de cadastro do gestor.
4. Clique em **Enviar e-mail**.

Mensagem: **Convite enviado para {e-mail}.** A pessoa define a senha pelo link descrito em [Primeiros passos](01-primeiros-passos.md). O link padrão vale 72 horas.

### Enviar link para a empresa se cadastrar

Use quando a empresa ainda não está na base e vai preencher os próprios dados.

1. Clique em **Enviar link de cadastro**.
2. Informe **Nome do responsável**, **E-mail** e **Tipo de empresa**.
3. Clique em **Enviar e-mail**.

Mensagem: **Link de cadastro enviado para {e-mail}.** O destinatário abre **Cadastrar empresa**, informa CNPJ, razão social, senha e logo.

### O que acontece em seguida

Empresa **Inativa** deixa de ser oferecida em novos acessos. Colaboradores e veículos continuam ligados a ela no histórico. Usuários dessa empresa são tratados em **Usuários de empresas**.

---

## Colaboradores

**Para que serve.** Manter o cadastro único de pessoas: equipe, prestadores e operação de eventos, com documento, função e foto para o facial.

**Quem usa.** Quem tem permissão de **Visualizar** Colaboradores.

**Onde fica.** Menu **Cadastros → Colaboradores** (`/admin/colaboradores`).

Subtítulo: **Cadastro global de pessoas físicas (equipe, prestadores e operação de eventos).**

### O que a lista mostra

Cartões: total, ativos, inativos e na blocklist.

Filtros: documento (CPF, RG ou passaporte), nome, tipo de documento, função, status (**Todos**, **Ativo**, **Inativo**, **Blocklist**) e **Limpar**.

Colunas: foto, nome, documento, tipo, função, status e blocklist (**Blocklist** ou traço).

Lista vazia: **Nenhum colaborador encontrado.**

Ações: **Detalhes**, **Editar** e, no menu, **Desativar** / **Ativar** e **Excluir** ou **Desvincular** quando a permissão permitir.

O bloqueio não é feito nesta lista. No formulário, quem está bloqueado aparece como **Na lista de bloqueio**, com o motivo, e o texto **Gerenciado no módulo Gestão de bloqueio.**

Botões do topo: **Atualizar**, **Upload em lote**, **Gerenciar funções** e **Novo colaborador**.

### Novo colaborador

1. Clique em **Novo colaborador**.
2. Preencha **Tipo de documento**, **Documento**, **Nome completo** e **Função / cargo**. **RG** e **Telefone** são opcionais.
3. Envie a **Foto** se for usar facial: arraste ou clique. JPEG, PNG ou WebP. A orientação pede enquadramento do rosto; o envio tratado fica em até 2 MB (o arquivo de origem pode chegar a 12 MB). **Capturar com webcam** tira a foto na hora.
4. Deixe **Colaborador ativo** ligado para o cadastro valer. Esse interruptor é independente da blocklist.
5. Clique em **Salvar colaborador**.

Mensagens: **Colaborador criado.**, **Colaborador vinculado à empresa.** ou **Colaborador atualizado.** Quando a foto serve aos leitores: **Foto validada para Control iD e Dahua.**

### Funções

**Gerenciar funções** abre a lista de cargos. Digite o nome e clique em **Adicionar**. Essas funções aparecem no filtro e no campo **Função / cargo**.

### Importar em lote

1. Clique em **Upload em lote**.
2. O subtítulo é **Modelo unificado de colaboradores — revise e confirme a importação.**
3. **Baixar modelo**, envie o arquivo, revise os dados e confirme **Importar colaboradores**.

As etapas são **Enviar arquivo**, **Revisar dados** e **Importar**.

### Detalhes

**Detalhes** mostra empresas vinculadas e os acessos registrados por empresa, com indicadores, tabela e **Exportar acessos**. **Fechar** volta à lista.

### O que acontece em seguida

A pessoa passa a ser encontrada na busca de acesso de serviço, evento, credenciamento e na relação de motorista da mercadoria. Sem foto válida, a portaria não consegue liberar o facial dessa pessoa. Estar **Inativo** ou na blocklist impede novo acesso.

---

## Frota

**Para que serve.** Cadastrar os veículos das empresas para acesso de serviço, evento e movimentação de mercadoria.

**Quem usa.** Quem tem permissão de **Visualizar** Frota.

**Onde fica.** Menu **Cadastros → Frota** (`/admin/frota`).

Subtítulo: **Veículos cadastrados por empresa.**

### O que a lista mostra

Cartões: total da página, ativos, inativos e na blocklist.

Filtros: placa (exemplo `ABC1D23`), marca ou modelo, empresa (para quem administra), tipo, status e **Limpar**.

Colunas: placa, marca, modelo, cor, tipo, empresa, descrição, status e blocklist.

Ações: **Editar** e, no menu, **Desativar** / **Ativar**, **Adicionar à blocklist** / **Remover da blocklist** e **Excluir** quando permitido.

Botões do topo: **Atualizar**, **Upload em lote** e **Novo veículo**.

### Novo veículo

1. Clique em **Novo veículo**.
2. Se o seu perfil escolhe a empresa, selecione **Empresa**. O link **Cadastrar empresa** abre o cadastro se ela ainda não existir.
3. Informe a **Placa** (obrigatória). Marca, modelo, cor, tipo e descrição são opcionais. Marca e modelo sugerem valores já usados.
4. Clique em **Criar veículo**.

Mensagem: **Veículo cadastrado.** Na edição, **Salvar veículo** responde **Veículo atualizado.** A edição também tem **Veículo ativo** e o bloqueio da frota, com o texto **Bloqueia o veículo em credenciamento e portaria.**

O cadastro individual não pede motorista. O vínculo de motorista entra na planilha de importação, coluna **Motorista (documento)**, apontando um colaborador da outra aba. Na revisão aparece **Motorista: {nome}** ou **Sem motorista informado**, e o resultado conta **Vínculos de motorista**.

### Bloquear uma placa

1. No menu da linha, escolha **Adicionar à blocklist**.
2. Informe o motivo com pelo menos 10 caracteres.
3. Confirme.

**Remover da blocklist** pergunta a confirmação e avisa que a placa volta a poder acessar a arena.

Isso é independente da **Gestão de bloqueio**, que trata pessoas.

### Importar em lote

**Upload em lote** usa o modelo unificado de veículos: enviar, revisar e **Importar veículos**.

### O que acontece em seguida

A placa credenciada é reconhecida em **Registrar entrada** e **Registrar saída**. No acesso de serviço e no evento, o veículo pode ser vinculado ao período. Placa na blocklist é recusada com **Veículo está na blocklist.**

---

## Times

**Para que serve.** Definir quem abre solicitação, quem aprova e quais tipos de pedido o setor trata. A portaria usa os contatos do setor como autorizantes.

**Quem usa.** Quem tem permissão de **Visualizar** Times. Criar setor novo é ação de administração. Um gestor de setor pode ver só este item, no grupo **Gestão**.

**Onde fica.** Menu **Cadastros → Times** (`/admin/setores`). O detalhe é `/admin/setores/{id}`.

Subtítulo da lista: **Gerencie times, membros e fluxos de aprovação.**

### Lista

Colunas: nome, descrição, quantidade de membros, contatos, fluxos e status (**Ativo** / **Inativo**).

**Gerenciar setor** abre o detalhe. O menu oferece **Editar cadastro** e **Desativar** / **Ativar**. **+ Novo setor** fica disponível para quem administra. **Atualizar** recarrega a lista.

### Novo setor

1. Clique em **+ Novo setor**.
2. Informe **Nome** (obrigatório) e **Descrição** (opcional).
3. Em **Contatos**, use **+ Contato**: nome obrigatório, e-mail, telefone e ramal.
4. Clique em **Criar setor**.

Mensagem: **Setor salvo.** A tela segue para o detalhe desse setor.

### Contatos

No detalhe, a seção **Contatos** explica: **Quem responde por este setor nas solicitações de credenciamento.**

**Adicionar contato** pede nome, e-mail, telefone e ramal e grava com **Salvar contato**. Cada contato pode ser editado ou removido. Esses dados aparecem na portaria em **Autorizantes do setor**.

### Membros e papéis

A seção **Membros** explica: **O papel define o que a pessoa pode fazer nas solicitações do setor.**

| Papel | O que faz |
|-------|-----------|
| Solicitante | Só abre solicitações |
| Aprovador | Abre e aprova solicitações do setor |
| Gestor | Aprova e administra membros e fluxos |

Para incluir alguém:

1. Em **Buscar usuário**, digite pelo menos duas letras (nome, e-mail ou login).
2. Selecione a pessoa.
3. Escolha **Papel no setor**.
4. Clique em **Vincular membro**.

O papel de quem já está na lista muda no próprio seletor da linha. **Remover** desvincula o membro. Não existe uma lista separada de autorizantes: quem aprova é membro **Aprovador** ou **Gestor**.

### Fluxos de aprovação

O painel informa: **Cada solicitação passa por uma única aprovação de um aprovador ou gestor do setor.**

| Fluxo | Uso |
|-------|-----|
| Evento | Credenciais para eventos na arena |
| Acesso de serviço | Prestadores e manutenção |
| Credenciamento | Terceiros e visitantes |
| Credenciamento (internos) | Colaboradores do grupo |

Ligue ou desligue cada fluxo. Se houver mudança não salva, a tela avisa **Alterações não salvas**. Clique em **Salvar fluxos**. Mensagem: **Fluxos salvos.**

O cabeçalho do setor mostra quantos dos quatro fluxos estão ativos.

### O que acontece em seguida

O setor ativo, com o fluxo ligado, passa a aparecer como **Time aprovador** no acesso de serviço, no evento e no credenciamento. As pendências caem em **Aprovações** para os aprovadores e gestores daquele setor.
