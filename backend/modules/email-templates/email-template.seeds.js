/** Seeds iniciais dos templates de sistema (HTML com CSS inline). */

const EMAIL_TEMPLATE_SEEDS = [
  {
    codigo: "invite_access",
    nome: "Convite de acesso",
    descricao: "E-mail enviado ao convidar usuário de empresa para definir senha.",
    assunto: "Cadastro de acesso — {{company_name}}",
    corpo_html:
      '<h2>Cadastro de acesso</h2><p>Olá <strong>{{nome}}</strong>,</p><p>Você foi convidado(a) para acessar o sistema <strong>{{organization_name}}</strong> como <strong>{{perfil_label}}</strong>{{company_suffix}}.</p><p><a href="{{invite_url}}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">Definir senha e acessar</a></p><p style="font-size:12px;color:#64748b;">Link válido por {{invite_ttl_hours}} horas.<br/>Se o botão não funcionar, copie e cole: {{invite_url}}</p>',
    corpo_texto:
      "Olá {{nome}},\n\nVocê foi convidado(a) para acessar o sistema {{organization_name}} como {{perfil_label}}{{company_suffix}}.\n\nAcesse o link abaixo para definir sua senha (válido por {{invite_ttl_hours}} horas):\n{{invite_url}}\n\nSe você não esperava este e-mail, ignore esta mensagem.",
  },
  {
    codigo: "event_created",
    nome: "Novo evento (responsável)",
    descricao: "Notifica a empresa responsável quando um evento é criado.",
    assunto: "Novo evento — {{event_name}}",
    corpo_html:
      '<h2>Novo evento</h2><p>A empresa foi definida como responsável pelo evento <strong>{{event_name}}</strong>.</p><p>Próximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.</p><p><a href="{{event_url}}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir evento</a></p>',
    corpo_texto:
      'Olá,\n\nA empresa foi definida como responsável pelo evento "{{event_name}}" no sistema {{organization_name}}.\n{{event_url_line}}\n\nPróximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.',
  },
  {
    codigo: "event_partner_linked",
    nome: "Empresa vinculada ao evento",
    descricao: "Notifica a empresa parceira quando é vinculada a um evento.",
    assunto: "Empresa vinculada ao evento — {{event_name}}",
    corpo_html:
      '<h2>Empresa vinculada ao evento</h2><p><strong>{{partner_name}}</strong> foi vinculada ao evento <strong>{{event_name}}</strong>.</p><p>Cadastre os colaboradores e, ao concluir, use <strong>Notificar término</strong>.</p><p><a href="{{event_url}}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir evento</a></p>',
    corpo_texto:
      'Olá,\n\n{{partner_name}} foi vinculada ao evento "{{event_name}}" no sistema {{organization_name}}.\nCadastre os colaboradores e, ao concluir, use Notificar término.\n{{event_url_line}}',
  },
  {
    codigo: "event_partner_complete",
    nome: "Cadastro concluído (parceira)",
    descricao: "Notifica a empresa responsável quando a parceira conclui o cadastro.",
    assunto: "Cadastro concluído — {{partner_name}} — {{event_name}}",
    corpo_html:
      '<h2>Cadastro de colaboradores concluído</h2><p>A empresa parceira <strong>{{partner_name}}</strong> notificou o término do cadastro no evento <strong>{{event_name}}</strong>.</p><p>Quando estiver pronto, use <strong>Notificar</strong> para enviar o evento ao setor de aprovação.</p><p><a href="{{event_url}}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir evento</a></p>',
    corpo_texto:
      'Olá,\n\nA empresa parceira "{{partner_name}}" notificou o término do cadastro de colaboradores no evento "{{event_name}}".\nQuando estiver pronto, use Notificar para enviar o evento ao setor de aprovação.\n{{event_url_line}}',
  },
  {
    codigo: "credential_approved",
    nome: "Credencial aprovada",
    descricao: "Enviado à empresa quando uma credencial é aprovada.",
    assunto: "Credencial aprovada — {{event_name}}",
    corpo_html:
      "<h2>Credencial aprovada</h2><p>Evento: <strong>{{event_name}}</strong></p><p>Dia: {{event_day}}</p><p>Colaborador: {{collaborator_name}}</p><p>Código de acesso (QR): <strong>{{access_id}}</strong></p>",
    corpo_texto:
      "Credencial aprovada\n\nEvento: {{event_name}}\nDia: {{event_day}}\nColaborador: {{collaborator_name}}\nCódigo de acesso (QR): {{access_id}}",
  },
];

module.exports = { EMAIL_TEMPLATE_SEEDS };
