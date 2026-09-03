"use strict";

require("dotenv").config();

const facialGatewayConfig = require("../modules/facial/facial-gateway-config.service");
const { logger } = require("../config/logger");
const { startupLaunch, startupFail } = require("../config/startupLog");
const { parseEnrollmentStatus } = require("../modules/facial/facial.contract");
const { enrollmentStatusSchema } = require("../modules/facial/facial.schema");
const serviceBusClient = require("../modules/facial/service-bus.client");
const enrollmentService = require("../modules/facial/facial.enrollment.service");

const MAX_DELIVERY_COUNT = 5;

async function processStatusMessage(message) {
  const body = message.body;
  const parsedContract = parseEnrollmentStatus(body);
  if (!parsedContract.ok) {
    throw new Error(parsedContract.error || "Payload enrollment-status inválido");
  }

  const { error } = enrollmentStatusSchema.validate(body, { abortEarly: false });
  if (error) {
    throw new Error(error.details.map((d) => d.message).join("; "));
  }

  await enrollmentService.applyEnrollmentStatus(parsedContract);
}

async function idle(reason) {
  startupLaunch(reason);
  await new Promise(() => {});
}

async function start() {
  const runtime = await facialGatewayConfig.getRuntimeConfig();
  if (!runtime.enabled) {
    await idle("Worker facial: integração desabilitada nas configurações — em espera.");
    return;
  }

  const transport = facialGatewayConfig.resolveTransport(runtime);
  if (transport !== "service_bus") {
    await idle(
      "Worker facial: modo HTTP poll — status chega via POST /api/facial/status. Receiver Service Bus não iniciado.",
    );
    return;
  }

  await serviceBusClient.createStatusReceiver(
    async (message, context) => {
      try {
        await processStatusMessage(message);
        await context.completeMessage(message);
      } catch (err) {
        logger.error(
          {
            err,
            messageId: message.messageId,
            deliveryCount: message.deliveryCount,
          },
          "Erro ao processar enrollment-status",
        );

        if (message.deliveryCount >= MAX_DELIVERY_COUNT) {
          await context.deadLetterMessage(message, {
            deadLetterReason: "ProcessingFailed",
            deadLetterErrorDescription: err.message,
          });
        } else {
          await context.abandonMessage(message);
        }
      }
    },
    async (args) => {
      logger.error({ err: args.error, entity: args.entityPath }, "Erro no receiver facial");
    },
  );

  startupLaunch("Worker facial-enrollment-status ativo");
}

async function shutdown(signal) {
  logger.info({ signal }, "Encerrando worker facial");
  await serviceBusClient.closeClients();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((err) => {
  startupFail(`Worker facial falhou: ${err.message}`);
  logger.fatal({ err }, "Worker facial não iniciou");
  process.exit(1);
});
