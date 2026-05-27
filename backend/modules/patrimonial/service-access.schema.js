const Joi = require("joi");

const serviceAccessCreateSchema = Joi.object({
  id_company: Joi.number().integer().positive().optional(),
  service_type: Joi.string().max(120).required(),
  description: Joi.string().max(500).allow("", null).optional(),
  dates: Joi.array().items(Joi.date().iso()).min(1).required(),
  id_vehicles: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
});

const serviceAccessStatusSchema = Joi.object({
  id_access_status: Joi.number().integer().valid(2, 3, 4).required(),
  reason: Joi.when("id_access_status", {
    is: 4,
    then: Joi.string().min(5).max(500).required(),
    otherwise: Joi.string().max(500).allow("", null).optional(),
  }),
});

module.exports = { serviceAccessCreateSchema, serviceAccessStatusSchema };
