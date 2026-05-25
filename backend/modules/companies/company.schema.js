const Joi = require("joi");
const { isValidCnpj, normalizeCnpj } = require("../../utils/cnpj");

const contactSchema = Joi.object({
  name: Joi.string().max(200).required(),
  department: Joi.string().max(100).allow("", null).optional(),
  phone: Joi.string().max(30).allow("", null).optional(),
  email: Joi.string().email().max(200).allow("", null).optional(),
});

const cnpjField = Joi.string()
  .required()
  .custom((value, helpers) => {
    const normalized = normalizeCnpj(value);
    if (!isValidCnpj(normalized)) {
      return helpers.error("any.invalid");
    }
    return normalized;
  })
  .messages({
    "any.invalid": "CNPJ inválido.",
  });

const companyCreateSchema = Joi.object({
  id_company_type: Joi.number().integer().positive().required(),
  cnpj: cnpjField,
  company_name: Joi.string().max(200).required(),
  fancy_name: Joi.string().max(200).allow("", null).optional(),
  status: Joi.boolean().optional(),
  contacts: Joi.array().items(contactSchema).optional(),
});

const companyUpdateSchema = Joi.object({
  id_company_type: Joi.number().integer().positive().optional(),
  cnpj: cnpjField.optional(),
  company_name: Joi.string().max(200).optional(),
  fancy_name: Joi.string().max(200).allow("", null).optional(),
  contacts: Joi.array().items(contactSchema).optional(),
}).min(1);

const companyStatusSchema = Joi.object({
  status: Joi.boolean().required(),
});

module.exports = {
  companyCreateSchema,
  companyUpdateSchema,
  companyStatusSchema,
  contactSchema,
};
