const Joi = require("joi");

const blockCreateSchema = Joi.object({
  id_collaborator: Joi.number().integer().positive().required(),
  reason: Joi.string().trim().min(10).max(500).required(),
  block_type: Joi.string().valid("permanent", "days", "events").required(),
  block_value: Joi.number().integer().min(1).max(3650).allow(null).optional(),
});

const blockUpdateSchema = Joi.object({
  reason: Joi.string().trim().min(10).max(500).optional(),
  block_type: Joi.string().valid("permanent", "days", "events").optional(),
  block_value: Joi.number().integer().min(1).max(3650).allow(null).optional(),
}).min(1);

module.exports = {
  blockCreateSchema,
  blockUpdateSchema,
};
