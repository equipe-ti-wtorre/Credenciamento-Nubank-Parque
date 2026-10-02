const Joi = require("joi");

const clientErrorSchema = Joi.object({
  message: Joi.string().trim().min(1).max(500).required(),
  stack: Joi.string().max(8000).allow("", null),
  path: Joi.string().max(255).allow("", null),
  requestId: Joi.string().max(64).allow("", null),
  userAgent: Joi.string().max(500).allow("", null),
  clientType: Joi.string().valid("web", "android", "ios", "mobile", "teams").allow("", null),
});

module.exports = { clientErrorSchema };
