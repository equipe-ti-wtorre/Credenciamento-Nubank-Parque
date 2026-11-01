const Joi = require("joi");

// Itens da aprovação seletiva: public_id (UUID) da linha de vínculo, ou id numérico (legado/bot).
const selectiveItemId = Joi.alternatives().try(
  Joi.string().guid({ version: ["uuidv1", "uuidv4"] }),
  Joi.number().integer().positive(),
);

const approveSchema = Joi.object({
  comentario: Joi.string().trim().max(500).allow("", null).optional(),
  approvedCollaboratorIds: Joi.array().items(selectiveItemId).optional(),
  approvedVehicleIds: Joi.array().items(selectiveItemId).optional(),
});

const rejectSchema = Joi.object({
  comentario: Joi.string().trim().min(1).max(500).required(),
});

const cancelSchema = Joi.object({
  comentario: Joi.string().trim().max(500).allow("", null).optional(),
});

module.exports = { approveSchema, rejectSchema, cancelSchema };
