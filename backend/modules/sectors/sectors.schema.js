const Joi = require("joi");

const SECTOR_PAPEIS = ["SOLICITANTE", "APROVADOR", "GESTOR"];

const sectorCreateSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(100).required(),
  descricao: Joi.string().trim().max(255).allow("", null).optional(),
});

const sectorUpdateSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(100).optional(),
  descricao: Joi.string().trim().max(255).allow("", null).optional(),
}).min(1);

const sectorStatusSchema = Joi.object({
  ativo: Joi.boolean().required(),
});

const memberCreateSchema = Joi.object({
  idUsuario: Joi.number().integer().positive().required(),
  papel: Joi.string().valid(...SECTOR_PAPEIS).required(),
});

const memberUpdateSchema = Joi.object({
  papel: Joi.string().valid(...SECTOR_PAPEIS).optional(),
  ativo: Joi.boolean().optional(),
}).min(1);

const flowsUpdateSchema = Joi.object({
  flows: Joi.array()
    .items(
      Joi.object({
        tipoEntidade: Joi.string().valid("EVENTO", "ACESSO_SERVICO").required(),
        ativo: Joi.boolean().required(),
      }),
    )
    .required(),
});

module.exports = {
  SECTOR_PAPEIS,
  sectorCreateSchema,
  sectorUpdateSchema,
  sectorStatusSchema,
  memberCreateSchema,
  memberUpdateSchema,
  flowsUpdateSchema,
};
