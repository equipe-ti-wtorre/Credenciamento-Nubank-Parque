# Mercadorias

Este grupo registra o que entra e sai do site e mantém o cadastro usado nesse registro: produtos, locais e remetentes que não são prestadores cadastrados.

O relatório de saldos e histórico fica em **Relatórios → Relatório de mercadorias**. Veja [Relatórios](05-relatorios.md).

---

## Registrar entrada

**Para que serve.** Anotar uma mercadoria que chega na portaria: ou ela entra no estoque do site, ou é uma entrega que só passa.

**Quem usa.** Quem tem permissão de **Visualizar** e **Criar** em Registrar entrada.

**Onde fica.** Menu **Mercadorias → Registrar entrada** (`/mercadorias/entrada`).

### Escolher a natureza

Dois cartões no início do formulário:

| Cartão | Quando usar |
|--------|-------------|
| Vai para o estoque | Material do site, insumo ou ativo. Exige produto, local e nota fiscal. Subtítulo: **Mercadoria que entra no inventário do site.** |
| Entrega / encomenda | Só passa pela portaria. Volumes, descrição e destinatário. Subtítulo: **Entrega ou encomenda que só passa pela portaria.** |

### Informar o veículo

1. Preencha a **Placa** (obrigatória), no formato `ABC1D23` ou `ABC1234`.
2. Ao sair do campo, o sistema consulta a placa.

- **Credenciada** — a placa pertence a uma empresa ou veículo cadastrados. Informe **Agente (empresa)**, **Veículo** e **Motorista / Ajudantes (CPF)**. Digite o CPF e clique em **Adicionar** (ou Enter). A primeira pessoa é o **Motorista**; as demais são **Ajudante**. **Remover** tira alguém da relação.
- **Eventual** — a placa não está no cadastro. Informe **Remetente** (razão social ou nome, com sugestões ao digitar), **CNPJ / CPF do remetente** (opcional), **Motorista** e **CPF / CNPJ do motorista**.

Mensagens possíveis na relação de pessoas: **Informe o CPF.**, **Colaborador não encontrado.**, **Colaborador está na blocklist.** e **Esta pessoa já está na relação.**

### Vai para o estoque

| Campo | Regra |
|-------|--------|
| Número da NF | Obrigatório, salvo se marcar **Sem nota fiscal** |
| Motivo da ausência | Obrigatório quando não há NF: Declaração de conteúdo, Encomenda pessoal, Remessa sem nota ou Outro |
| Itens da NF | Pelo menos um. Cada linha: **Produto**, **Local** e **Qtd**. **Adicionar item** inclui outra linha. **Remover** só funciona se houver mais de um item |

Se a leitura da nota trouxer um item desconhecido, a tela mostra **Lido na NF: {descrição}**, sugere produtos e oferece **Cadastrar produto** (descrição, unidade e **Salvar produto**) ou **Cancelar cadastro**.

### Entrega / encomenda

| Campo | Regra |
|-------|--------|
| Volumes | Obrigatório, de 1 a 999 |
| Descrição do conteúdo | Obrigatório |
| Destinatário (área) | Obrigatório. Exemplo: TI, Almoxarifado |

### Foto da nota

A foto é opcional e recomendada: ela dispara a leitura automática da nota.

- Arraste a imagem ou clique para procurar. Formatos JPEG, PNG ou WebP, até 2 MB.
- **Tirar foto** abre a câmera do computador. O painel **Tirar foto da NF** pede para enquadrar a nota inteira.
- **Câmera do celular** usa o aparelho.
- Enquanto lê: **Lendo NF…**

A leitura pode preencher número da NF, emitente, itens e quantidades. Se o CNPJ vier com pouca confiança: **Confira o CNPJ — leitura de baixa confiança.** Remetentes lidos e ainda não revisados também aparecem em **Empresas eventuais**.

### Confirmar

**Cancelar** volta à tela anterior. **Confirmar entrada** grava o movimento. Durante o envio o botão pode mostrar **Lendo NF…** ou **Registrando…**. Sucesso: **Entrada registrada.**

### O que acontece em seguida

O item de estoque soma no saldo do produto e do local. A entrega/encomenda fica no histórico, sem alterar saldo de produto. Tudo aparece no **Relatório de mercadorias**.

---

## Registrar saída

**Para que serve.** Anotar mercadoria que deixa o site, no mesmo formulário da entrada.

**Quem usa.** Quem tem permissão de **Visualizar** e **Criar** em Registrar saída.

**Onde fica.** Menu **Mercadorias → Registrar saída** (`/mercadorias/saida`).

O preenchimento é o mesmo da entrada: natureza, placa, origem credenciada ou eventual, nota e itens ou volumes, foto e leitura.

O que muda na tela:

| | Entrada | Saída |
|--|---------|--------|
| Subtítulo do estoque | Mercadoria que entra no inventário do site. | Mercadoria que sai do inventário do site. |
| Subtítulo da entrega | Entrega ou encomenda que só passa pela portaria. | Entrega ou encomenda saindo do site. |
| Botão | Confirmar entrada | Confirmar saída |
| Sucesso | Entrada registrada. | Saída registrada. |

A saída de estoque reduz o saldo do produto no local escolhido.

---

## Produtos

**Para que serve.** Manter a lista de produtos usada nos itens da nota quando a mercadoria vai para o estoque.

**Quem usa.** Quem tem permissão de **Visualizar** Produtos. **Criar** e **Editar** liberam o cadastro e a ativação.

**Onde fica.** Menu **Mercadorias → Produtos** (`/admin/mercadorias-produtos`).

Subtítulo: **Cadastro de produtos para controle de estoque.**

Colunas: descrição, unidade, fabricante e status (**Ativo** / **Inativo**). Lista vazia: **Nenhum produto cadastrado.**

### Novo produto

1. Clique em **+ Novo produto**.
2. Preencha **Descrição** (obrigatória), **Unidade de medida** (obrigatória; exemplos UN, KG, CX) e **Fabricante** (opcional).
3. Clique em **Criar produto**.

Na edição, o campo **Status** permite **Ativo** ou **Inativo**, e o botão passa a **Salvar produto**. Na lista, **Editar produto** abre o mesmo painel. O menu da linha oferece **Inativar** ou **Ativar**.

Um produto inativo deixa de ser oferecido nas movimentações novas. O histórico antigo permanece no relatório.

---

## Locais de armazenagem

**Para que serve.** Cadastrar depósitos e lojas para onde a mercadoria de estoque é lançada.

**Quem usa.** Quem tem permissão de **Visualizar** Locais de armazenagem.

**Onde fica.** Menu **Mercadorias → Locais de armazenagem** (`/admin/mercadorias-locais`).

Subtítulo: **Depósitos e lojas para movimentação de mercadorias.**

Colunas: nome, tipo (**Depósito** ou **Loja**) e status. Lista vazia: **Nenhum local cadastrado.**

### Novo local

1. Clique em **+ Novo local**.
2. Informe **Nome** (obrigatório) e **Tipo** (**Depósito** ou **Loja**).
3. Clique em **Criar local**.

Na edição há **Status** e o botão **Salvar local**. Na lista: **Editar local** e **Inativar** / **Ativar**.

O local ativo aparece no select **Local** do item da nota.

---

## Empresas eventuais

**Para que serve.** Revisar remetentes que não são prestadores cadastrados — em geral lidos na nota — e juntar duplicatas.

**Quem usa.** Quem tem permissão de **Visualizar** Empresas eventuais.

**Onde fica.** Menu **Mercadorias → Empresas eventuais** (`/admin/mercadorias-eventuais`).

Subtítulo: **Identidade de remetentes sem cadastro de prestador. Corrija OCR e una duplicatas.**

Filtro **Revisão:** **Pendentes de revisão** (padrão), **Revisadas** ou **Todas**.

Colunas: razão social, documento, origem, quantidade de movimentos e **Revisado** (**Sim** ou **Pendente**). Lista vazia: **Nenhuma empresa eventual nesta fila.**

### Revisar

1. Clique em **Revisar**.
2. Ajuste **Razão social**, **Nome fantasia**, **UF**, **Município** e **Endereço**.
3. Clique em **Marcar revisado**.

### Unir duplicata

1. No menu da linha, escolha **Unir com outra**.
2. Informe o **ID do destino**.
3. Clique em **Unir**.

Os movimentos da origem passam para o destino e a origem é removida. Confira o identificador do destino na lista antes de confirmar.
