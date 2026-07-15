const Joi = require("joi");

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(20),
  unreadOnly: Joi.boolean()
    .truthy("true", "1", 1)
    .falsy("false", "0", 0)
    .default(false),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

module.exports = {
  listQuerySchema,
  idParamSchema,
};
