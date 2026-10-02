/** Seeds iniciais dos templates de sistema (HTML com CSS inline). */

const {
  FOOTER_INVITE,
  emphasis,
  buildLinkNote,
  buildDetailNote,
  buildBrandedEmail,
} = require("./email-template.layout");

const EMAIL_TEMPLATE_SEEDS = [
  {
    codigo: "invite_access",
    nome: "Convite de acesso",
    descricao: "E-mail enviado ao convidar usuário de empresa para definir senha.",
    assunto: "Cadastro de acesso — {{company_name}}",
    corpo_html: buildBrandedEmail({
      preheader:
        "Você foi convidado(a) para acessar o sistema Credenciamento do Nubank Parque. Link válido por {{invite_ttl_hours}} horas.",
      title: "Cadastro de acesso",
      kicker: "Convite ao sistema Credenciamento",
      paragraphs: [
        `Olá ${emphasis("{{nome}}")},`,
        `Você foi convidado(a) para acessar o sistema ${emphasis("Credenciamento")} da empresa ${emphasis("{{company_name}}")}.`,
      ],
      cta: { href: "{{invite_url}}", label: "Definir senha e acessar" },
      noteHtml: buildLinkNote({
        validFor: "{{invite_ttl_hours}} horas",
        url: "{{invite_url}}",
      }),
      footerDisclaimer: FOOTER_INVITE,
    }),
    corpo_texto:
      "Olá {{nome}},\n\nVocê foi convidado(a) para acessar o sistema {{organization_name}} como {{perfil_label}}{{company_suffix}}.\n\nAcesse o link abaixo para definir sua senha (válido por {{invite_ttl_hours}} horas):\n{{invite_url}}\n\nSe você não esperava este e-mail, ignore esta mensagem.",
  },
  {
    codigo: "company_self_register",
    nome: "Auto cadastro de empresa",
    descricao: "E-mail enviado ao convidar uma empresa para se cadastrar pelo link.",
    assunto: "Cadastro da empresa — {{organization_name}}",
    corpo_html: buildBrandedEmail({
      preheader:
        "Você foi convidado(a) a cadastrar sua empresa no sistema Credenciamento do Nubank Parque. Link válido por {{invite_ttl_hours}} horas.",
      title: "Cadastro da empresa",
      kicker: "Convite ao sistema Credenciamento",
      paragraphs: [
        `Olá ${emphasis("{{nome}}")},`,
        `Você foi convidado(a) a cadastrar sua empresa no sistema ${emphasis("Credenciamento")} como ${emphasis("{{company_type_label}}")}.`,
      ],
      cta: { href: "{{invite_url}}", label: "Cadastrar empresa" },
      noteHtml: buildLinkNote({
        validFor: "{{invite_ttl_hours}} horas",
        url: "{{invite_url}}",
      }),
      footerDisclaimer: FOOTER_INVITE,
    }),
    corpo_texto:
      "Olá {{nome}},\n\nVocê foi convidado(a) a cadastrar sua empresa no sistema {{organization_name}} como {{company_type_label}}.\n\nAcesse o link abaixo para preencher os dados e definir sua senha (válido por {{invite_ttl_hours}} horas):\n{{invite_url}}\n\nSe você não esperava este e-mail, ignore esta mensagem.",
  },
  {
    codigo: "event_created",
    nome: "Novo evento (responsável)",
    descricao: "Notifica a empresa responsável quando um evento é criado.",
    assunto: "Novo evento — {{event_name}}",
    corpo_html: buildBrandedEmail({
      preheader:
        "A empresa foi definida como responsável pelo evento {{event_name}} no Credenciamento do Nubank Parque.",
      title: "Novo evento",
      kicker: "Notificação de evento",
      paragraphs: [
        "Olá,",
        `A empresa foi definida como responsável pelo evento ${emphasis("{{event_name}}")}.`,
        "Próximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.",
      ],
      cta: { href: "{{event_url}}", label: "Abrir evento" },
      noteHtml: buildLinkNote({ url: "{{event_url}}" }),
    }),
    corpo_texto:
      'Olá,\n\nA empresa foi definida como responsável pelo evento "{{event_name}}" no sistema {{organization_name}}.\n{{event_url_line}}\n\nPróximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.',
  },
  {
    codigo: "event_partner_linked",
    nome: "Empresa vinculada ao evento",
    descricao: "Notifica a empresa parceira quando é vinculada a um evento.",
    assunto: "Empresa vinculada ao evento — {{event_name}}",
    corpo_html: buildBrandedEmail({
      preheader: "{{partner_name}} foi vinculada ao evento {{event_name}}.",
      title: "Empresa vinculada ao evento",
      kicker: "Notificação de evento",
      paragraphs: [
        "Olá,",
        `${emphasis("{{partner_name}}")} foi vinculada ao evento ${emphasis("{{event_name}}")}.`,
        `Cadastre os colaboradores e, ao concluir, use ${emphasis("Notificar término")}.`,
      ],
      cta: { href: "{{event_url}}", label: "Abrir evento" },
      noteHtml: buildLinkNote({ url: "{{event_url}}" }),
    }),
    corpo_texto:
      'Olá,\n\n{{partner_name}} foi vinculada ao evento "{{event_name}}" no sistema {{organization_name}}.\nCadastre os colaboradores e, ao concluir, use Notificar término.\n{{event_url_line}}',
  },
  {
    codigo: "event_partner_complete",
    nome: "Cadastro concluído (parceira)",
    descricao: "Notifica a empresa responsável quando a parceira conclui o cadastro.",
    assunto: "Cadastro concluído — {{partner_name}} — {{event_name}}",
    corpo_html: buildBrandedEmail({
      preheader:
        "{{partner_name}} concluiu o cadastro de colaboradores no evento {{event_name}}.",
      title: "Cadastro de colaboradores concluído",
      kicker: "Notificação de evento",
      paragraphs: [
        "Olá,",
        `A empresa parceira ${emphasis("{{partner_name}}")} notificou o término do cadastro no evento ${emphasis("{{event_name}}")}.`,
        `Quando estiver pronto, use ${emphasis("Notificar")} para enviar o evento ao setor de aprovação.`,
      ],
      cta: { href: "{{event_url}}", label: "Abrir evento" },
      noteHtml: buildLinkNote({ url: "{{event_url}}" }),
    }),
    corpo_texto:
      'Olá,\n\nA empresa parceira "{{partner_name}}" notificou o término do cadastro de colaboradores no evento "{{event_name}}".\nQuando estiver pronto, use Notificar para enviar o evento ao setor de aprovação.\n{{event_url_line}}',
  },
  {
    codigo: "credential_approved",
    nome: "Credencial aprovada",
    descricao: "Enviado à empresa quando uma credencial é aprovada.",
    assunto: "Credencial aprovada — {{event_name}}",
    corpo_html: buildBrandedEmail({
      preheader:
        "Credencial aprovada para {{collaborator_name}} no evento {{event_name}}.",
      title: "Credencial aprovada",
      kicker: "Credenciamento",
      paragraphs: ["A credencial abaixo foi aprovada."],
      noteHtml: buildDetailNote([
        { label: "Evento", value: "{{event_name}}" },
        { label: "Dia", value: "{{event_day}}" },
        { label: "Colaborador", value: "{{collaborator_name}}" },
        { label: "Código de acesso (QR)", value: "{{access_id}}" },
      ]),
    }),
    corpo_texto:
      "Credencial aprovada\n\nEvento: {{event_name}}\nDia: {{event_day}}\nColaborador: {{collaborator_name}}\nCódigo de acesso (QR): {{access_id}}",
  },
];

module.exports = { EMAIL_TEMPLATE_SEEDS };
