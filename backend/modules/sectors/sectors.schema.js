const Joi = require("joi");

const SECTOR_PAPEIS = ["SOLICITANTE", "APROVADOR", "GESTOR"];

const contactSchema = Joi.object({
  id: Joi.number().integer().positive().optional(),
  nome: Joi.string().trim().min(2).max(200).required(),
  telefone: Joi.string().trim().max(30).allow("", null).optional(),
  ramal: Joi.string().trim().max(20).allow("", null).optional(),
  email: Joi.string().email().trim().max(200).allow("", null).optional(),
});

const sectorCreateSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(100).required(),
  descricao: Joi.string().trim().max(255).allow("", null).optional(),
  contacts: Joi.array().items(contactSchema).optional(),
});

const sectorUpdateSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(100).optional(),
  descricao: Joi.string().trim().max(255).allow("", null).optional(),
  contacts: Joi.array().items(contactSchema).optional(),
}).min(1);

const contactCreateSchema = contactSchema.fork("id", (s) => s.forbidden());
const contactUpdateSchema = contactSchema;

const sectorStatusSchema = Joi.object({
  ativo: Joi.boolean().required(),
});

const MEMBER_FLOW_TYPES = [
  "ACESSO_SERVICO",
  "CREDENCIAMENTO_EVENTO",
  "CREDENCIAMENTO_EVENTO_INTERNO",
];

const memberCreateSchema = Joi.object({
  id_usuario: Joi.number().integer().positive().required(),
  papel: Joi.string().valid(...SECTOR_PAPEIS).required(),
  fluxos: Joi.array()
    .items(Joi.string().valid(...MEMBER_FLOW_TYPES))
    .unique()
    .optional(),
});

const memberFlowSchema = Joi.object({
  tipoEntidade: Joi.string().valid(...MEMBER_FLOW_TYPES).required(),
  ativo: Joi.boolean().required(),
});

const memberUpdateSchema = Joi.object({
  papel: Joi.string().valid(...SECTOR_PAPEIS).optional(),
  ativo: Joi.boolean().optional(),
}).min(1);

const flowsUpdateSchema = Joi.object({
  flows: Joi.array()
    .items(
      Joi.object({
        tipoEntidade: Joi.string()
          .valid(
            "EVENTO",
            "ACESSO_SERVICO",
            "CREDENCIAMENTO_EVENTO",
            "CREDENCIAMENTO_EVENTO_INTERNO",
          )
          .required(),
        ativo: Joi.boolean().required(),
      }),
    )
    .required(),
});

module.exports = {
  SECTOR_PAPEIS,
  contactSchema,
  contactCreateSchema,
  contactUpdateSchema,
  sectorCreateSchema,
  sectorUpdateSchema,
  sectorStatusSchema,
  MEMBER_FLOW_TYPES,
  memberCreateSchema,
  memberFlowSchema,
  memberUpdateSchema,
  flowsUpdateSchema,
};
