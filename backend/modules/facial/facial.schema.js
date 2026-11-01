"use strict";

const Joi = require("joi");
const { STATUS_ENROLLMENT, COMMAND_ENROLL, COMMAND_REVOKE } = require("./facial.contract");

const deviceStatusSchema = Joi.object({
  status: Joi.string().required(),
  error: Joi.string().optional(),
}).unknown(true);

const enrollmentStatusSchema = Joi.object({
  type: Joi.string().valid(STATUS_ENROLLMENT).required(),
  correlationId: Joi.string().allow(null, "").optional(),
  correlation_id: Joi.string().allow(null, "").optional(),
  linkedId: Joi.string().allow(null, "").optional(),
  linked_id: Joi.string().allow(null, "").optional(),
  userId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  command: Joi.string().valid(COMMAND_ENROLL, COMMAND_REVOKE).optional(),
  overallStatus: Joi.string()
    .valid("synced", "partial", "pending", "failed")
    .optional(),
  overall_status: Joi.string()
    .valid("synced", "partial", "pending", "failed")
    .optional(),
  devices: Joi.object().pattern(Joi.string(), deviceStatusSchema).optional(),
  error: Joi.string().allow(null, "").optional(),
  timestamp: Joi.string().optional(),
}).unknown(true);

const accessEventSchema = Joi.object({
  type: Joi.string().valid("access").required(),
  source: Joi.string().optional(),
  eventId: Joi.number().integer().required(),
  deviceId: Joi.string().required(),
  direcao: Joi.string().valid("entrada", "saida").optional(),
  userId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  cardNo: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  method: Joi.string().allow(null, "").optional(),
  status: Joi.string().allow(null, "").optional(),
  recNo: Joi.number().integer().allow(null).optional(),
  eventTime: Joi.string().required(),
  antipassback: Joi.boolean().optional(),
  blocked: Joi.boolean().optional(),
}).unknown(true);

const facialGatewaySettingsSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  events_secret: Joi.string().allow("").optional(),
  commands_connection_string: Joi.string().allow("").optional(),
  commands_queue: Joi.string().max(128).optional(),
  status_connection_string: Joi.string().allow("").optional(),
  status_queue: Joi.string().max(128).optional(),
  peer_origin_ip: Joi.string().allow("").max(512).optional(),
  peer_destination_ip: Joi.string().allow("").max(512).optional(),
}).min(1);

const claimJobsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(20).optional(),
}).unknown(true);

const facialEnrollBodySchema = Joi.object({
  photoBase64: Joi.string().allow("", null).optional(),
}).unknown(true);

const facialDeviceSchema = Joi.object({
  device_key: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9_-]{1,64}$/)
    .required()
    .messages({ "string.pattern.base": "Identificador do aparelho: letras, números, _ e -" }),
  name: Joi.string().trim().min(1).max(128).required(),
  host: Joi.string().trim().min(1).max(255).required(),
  port: Joi.number().integer().min(1).max(65535).default(80),
  username: Joi.string().trim().min(1).max(128).required(),
  password: Joi.string().allow("").max(128).optional(),
  enabled: Joi.boolean().default(true),
});

module.exports = {
  enrollmentStatusSchema,
  accessEventSchema,
  facialGatewaySettingsSchema,
  claimJobsSchema,
  facialEnrollBodySchema,
  facialDeviceSchema,
};
