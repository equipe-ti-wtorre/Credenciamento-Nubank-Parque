const Joi = require("joi");

const vehicleCreateSchema = Joi.object({
  id_company: Joi.number().integer().positive().optional(),
  plate: Joi.string().max(10).required(),
  brand: Joi.string().max(80).allow("", null).optional(),
  model: Joi.string().max(80).allow("", null).optional(),
  color: Joi.string().max(40).allow("", null).optional(),
  type: Joi.string().max(40).allow("", null).optional(),
  description: Joi.string().max(200).allow("", null).optional(),
  status: Joi.boolean().optional(),
});

const vehicleUpdateSchema = Joi.object({
  plate: Joi.string().max(10).optional(),
  brand: Joi.string().max(80).allow("", null).optional(),
  model: Joi.string().max(80).allow("", null).optional(),
  color: Joi.string().max(40).allow("", null).optional(),
  type: Joi.string().max(40).allow("", null).optional(),
  description: Joi.string().max(200).allow("", null).optional(),
  status: Joi.boolean().optional(),
}).min(1);

module.exports = { vehicleCreateSchema, vehicleUpdateSchema };
