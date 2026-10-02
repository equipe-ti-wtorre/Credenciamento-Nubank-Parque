# Sistema

Perfis e usuários definem quem entra na plataforma e o que cada pessoa pode ver. Isso é diferente de aprovar um acesso à arena: aqui se libera o uso das telas.

---

## Perfis

**Para que serve.** Agrupar permissões. Cada usuário interno ou de empresa pertence a um perfil, e o menu mostra só os módulos marcados nesse perfil.

**Quem usa.** Quem tem permissão de **Visualizar** Perfis de acesso. **Criar** e **Editar** liberam o formulário. Excluir vale para perfis customizados.

**Onde fica.** Menu **Sistema → Perfis** (`/admin/perfis`).

Subtítulo: **Configure perfis e defina permissões por módulo e ação.**

### O que a lista mostra

Colunas: nome, código, quantidade de usuários, tipo (**Sistema** ou **Customizado**) e ações.

**Editar perfil** abre o perfil. O menu oferece **Excluir** nos customizados. Perfis de sistema permanecem. **+ Novo perfil** cria um perfil novo. **Atualizar** recarrega a lista.

### Criar ou editar um perfil

1. Clique em **+ Novo perfil** ou em **Editar perfil**.
2. O subtítulo do painel é **Defina nome e permissões de acesso**.
3. Informe **Nome** (obrigatório) e **Descrição** (opcional).
4. Se o perfil for de usuário ligado a uma empresa, marque **Exige empresa vinculada ao usuário**. Essa opção não aparece no perfil de acesso total.
5. Na matriz, cada linha é um módulo (Início, Portaria, Empresas, Colaboradores e os demais, agrupados como no menu e em Configurações). Cada coluna é uma ação:

| Coluna | Efeito |
|--------|--------|
| Visualizar | O item aparece no menu e a tela abre |
| Criar | Botões de incluir (novo, importar, enviar) |
| Editar | Salvar alterações, ativar, aprovar quando a tela usa esta ação |
| Excluir | Remover o registro |

Atalhos: **Marcar todos: Visualizar**, **Limpar seleção** e, em cada linha, o botão que marca ou desmarca todas as ações daquele módulo.

6. Clique em **Salvar**.

Mensagem: **Perfil salvo com sucesso.** Ao editar, o bloco **Usuários neste perfil** lista quem já usa o perfil, somente para consulta. A exclusão confirma e responde **Perfil excluído.**

### O que acontece em seguida

Quem já está nesse perfil passa a ver o menu novo no próximo carregamento. Um módulo sem **Visualizar** some do menu, mesmo que criar ou editar estejam marcados. Combine o perfil com o papel no time: o perfil libera a tela de Aprovações; o papel **Aprovador** ou **Gestor** no time é que coloca a solicitação na fila daquela pessoa.

---

## Usuários internos

**Para que serve.** Atribuir perfil, departamento e regra de inatividade a quem trabalha na organização. Contas Microsoft vêm do diretório; contas locais têm senha na plataforma.

**Quem usa.** Quem tem permissão de **Visualizar** Usuários internos.

**Onde fica.** Menu **Sistema → Usuários internos** (`/admin/usuarios`).

A lista mostra apenas usuários ativos com departamento cadastrado. Bloqueados não aparecem. Quando a sincronização com o diretório está ligada, o subtítulo também descreve esse vínculo.

### O que a lista mostra

Cartões: ativos, administradores e usuários.

Filtros: **Nome ou e-mail**, **Perfil** e **Limpar**.

Colunas: nome, e-mail, departamento, perfil e tipo (**Microsoft** ou **Local**).

Ações: **Editar perfil** (conta Microsoft) ou **Editar usuário** (conta local). O menu oferece **Bloquear acesso**, desabilitado para a sua própria conta.

Não há convite manual nesta tela. A entrada de contas Microsoft é **Importar do Azure AD**. Contas locais são editadas aqui.

### Importar do Azure AD

1. Clique em **Importar do Azure AD**. Enquanto roda, o botão mostra **Sincronizando AD...**.
2. Ao terminar, a mensagem resume quantos são novos, atualizados ou vinculados, ou informa que não houve alteração.

O diretório usado é o cadastrado em **Configurações → Tenants Azure**.

### Editar

**Conta Microsoft:** altere o **Perfil de acesso**. O e-mail aparece como gerenciado pelo diretório.

**Conta local:**

| Campo | Regra |
|-------|--------|
| Nome completo | Obrigatório |
| Departamento | Obrigatório |
| E-mail | Obrigatório |
| Nova senha | Opcional. Vazio mantém a atual. Mínimo de 6 caracteres. Ao trocar, a sessão dessa pessoa é encerrada |

**Logout por inatividade:**

| Opção | Efeito |
|-------|--------|
| Padrão do sistema ({N} min) | Usa o tempo de Configurações → Sessão |
| Personalizado | Um número entre 5 e 480 minutos |
| Desativado | Esta pessoa não é desconectada por inatividade no navegador |

Se o perfil exige empresa, escolha **Empresa vinculada**.

Clique em **Salvar alterações**. Mensagem: **Usuário atualizado.**

### Bloquear acesso

**Bloquear acesso** tira a pessoa da lista de ativos e impede novo login. Mensagem: **Usuário bloqueado.** Isso não é a blocklist da arena: a pessoa deixa de usar a plataforma; colaboradores na portaria são tratados em **Gestão de bloqueio**.

---

## Usuários de empresas

**Para que serve.** Dar login a gestores e solicitantes das empresas cadastradas, em geral por convite de e-mail.

**Quem usa.** Quem tem permissão de **Visualizar** Usuários de empresas.

**Onde fica.** Menu **Sistema → Usuários de empresas** (`/admin/usuarios-empresas`).

Subtítulo: **Gestores e solicitantes vinculados às empresas cadastradas.**

### O que a lista mostra

Filtros: nome ou e-mail, empresa (para quem administra) e perfil:

- **Gestor da Empresa**
- **Solicitante da Empresa**

Colunas: nome, e-mail, empresa, perfil e status (**Ativo** ou **Pendente / Inativo**).

Ações: **Editar**, **Reenviar convite**, **Desativar** / **Ativar** e **Excluir** quando permitido.

Botões do topo: **Atualizar** e **+ Novo usuário**.

### Novo usuário

1. Clique em **+ Novo usuário**. O subtítulo é **Usuários com perfil de solicitações da empresa.**
2. Escolha a **Empresa** (quando o seu perfil escolhe), **Nome completo** e **E-mail**.
3. Escolha o perfil **Solicitante da Empresa** ou **Gestor da Empresa** quando essa escolha estiver disponível.
4. Deixe **Enviar convite por e-mail** marcado para a pessoa definir a própria senha. Se desmarcar, informe a senha na hora.
5. Clique em **Salvar**.

Com convite: **Convite enviado.** Sem convite: **Usuário criado.** Edição: **Usuário atualizado.**

O e-mail traz o link de **Definir senha e acessar**, válido por 72 horas no padrão do sistema. O texto pode ser ajustado em **Templates de e-mail**.

### Reenviar convite

No menu da linha, **Reenviar convite** confirma: **Um novo e-mail será enviado para {e-mail}.** Mensagem: **Convite reenviado.** Use quando o link anterior venceu.

**Desativar** responde **Usuário desativado.** e impede o login sem apagar o histórico. **Ativar** devolve o acesso.

### O que acontece em seguida

O gestor ou solicitante entra com o e-mail da empresa e passa a abrir acessos de serviço, indicar colaboradores no credenciamento e ver somente o que aquele perfil permite. O solicitante do setor, quando também for membro **Solicitante** em **Times**, é quem cria o pedido; a aprovação continua com o aprovador do setor.
