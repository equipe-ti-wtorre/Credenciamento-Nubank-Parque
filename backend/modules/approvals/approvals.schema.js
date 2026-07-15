const Joi = require("joi");

const approveSchema = Joi.object({
  comentario: Joi.string().trim().max(500).allow("", null).optional(),
  approvedCollaboratorIds: Joi.array().items(Joi.number().integer().positive()).optional(),
  approvedVehicleIds: Joi.array().items(Joi.number().integer().positive()).optional(),
});

const rejectSchema = Joi.object({
  comentario: Joi.string().trim().min(1).max(500).required(),
});

const cancelSchema = Joi.object({
  comentario: Joi.string().trim().max(500).allow("", null).optional(),
});

module.exports = { approveSchema, rejectSchema, cancelSchema };
