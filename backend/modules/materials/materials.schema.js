const Joi = require("joi");

const locationTypes = ["DEPOSITO", "LOJA"];

const locationCreateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  type: Joi.string().valid(...locationTypes).default("DEPOSITO"),
});

const locationUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  type: Joi.string().valid(...locationTypes),
  status: Joi.boolean(),
}).min(1);

const productCreateSchema = Joi.object({
  description: Joi.string().trim().min(1).max(200).required(),
  unit_measure: Joi.string().trim().min(1).max(40).required(),
  manufacturer: Joi.string().trim().max(120).allow("", null),
});

const productUpdateSchema = Joi.object({
  description: Joi.string().trim().min(1).max(200),
  unit_measure: Joi.string().trim().min(1).max(40),
  manufacturer: Joi.string().trim().max(120).allow("", null),
  status: Joi.boolean(),
}).min(1);

const movementItemSchema = Joi.object({
  id_product: Joi.number().integer().positive().required(),
  id_storage_location: Joi.number().integer().positive().required(),
  quantity: Joi.number().positive().required(),
});

const movementPayloadSchema = Joi.object({
  id_company: Joi.number().integer().positive().required(),
  invoice_number: Joi.string().trim().min(1).max(60).required(),
  id_collaborator: Joi.number().integer().positive().required(),
  id_vehicle: Joi.number().integer().positive().required(),
  items: Joi.array().items(movementItemSchema).min(1).required(),
});

const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  from: Joi.string().allow(""),
  to: Joi.string().allow(""),
  movement_type: Joi.string().valid("ENTRADA", "SAIDA").allow(""),
  id_company: Joi.number().integer().positive().allow(""),
});

const dashboardQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(90).default(7),
});

module.exports = {
  locationCreateSchema,
  locationUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  movementPayloadSchema,
  historyQuerySchema,
  dashboardQuerySchema,
};
