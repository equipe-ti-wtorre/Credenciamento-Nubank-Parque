"use strict";

const { child } = require("../../config/logger");
const facialGatewayConfig = require("./facial-gateway-config.service");

const logger = child({ module: "facial-service-bus" });

let commandsSender = null;
let statusReceiver = null;
let serviceBusClient = null;
let statusClient = null;
let activeCommandsConn = null;
let activeStatusConn = null;

function resetClients() {
  commandsSender = null;
  statusReceiver = null;
  serviceBusClient = null;
  statusClient = null;
  activeCommandsConn = null;
  activeStatusConn = null;
}

async function getServiceBusModule() {
  return require("@azure/service-bus");
}

async function getRuntime() {
  return facialGatewayConfig.getRuntimeConfig();
}

async function getCommandsSender() {
  const runtime = await getRuntime();
  if (!runtime.enabled) return null;

  const conn = runtime.serviceBus.commandsConnectionString;
  if (!conn) {
    logger.warn("Connection string de comandos facial não configurada");
    return null;
  }

  if (commandsSender && activeCommandsConn === conn) {
    return commandsSender;
  }

  if (serviceBusClient) {
    try {
      await serviceBusClient.close();
    } catch {
      /* ignore */
    }
  }

  const { ServiceBusClient } = await getServiceBusModule();
  serviceBusClient = new ServiceBusClient(conn);
  commandsSender = serviceBusClient.createSender(runtime.serviceBus.commandsQueue);
  activeCommandsConn = conn;
  return commandsSender;
}

async function sendCommand(payload, { correlationId } = {}) {
  const runtime = await getRuntime();
  if (!runtime.enabled) {
    logger.debug("Integração facial desabilitada — comando ignorado");
    return { skipped: true };
  }

  const sender = await getCommandsSender();
  if (!sender) {
    logger.warn("Service Bus commands sender indisponível — comando não enviado");
    return { skipped: true, reason: "no_sender" };
  }

  const body = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(body, "utf8");
  if (byteLength > runtime.maxMessageBytes) {
    throw new Error(
      `Mensagem facial excede limite Service Bus (${byteLength} > ${runtime.maxMessageBytes} bytes).`,
    );
  }

  await sender.sendMessages({
    body: payload,
    contentType: "application/json",
    correlationId: correlationId || payload.correlationId || undefined,
  });

  logger.info(
    { type: payload.type, correlationId: payload.correlationId, bytes: byteLength },
    "Comando facial enviado",
  );
  return { sent: true, bytes: byteLength };
}

async function createStatusReceiver(onMessage, onError) {
  const runtime = await getRuntime();
  if (!runtime.enabled) {
    logger.info("Integração facial desabilitada — worker de status não iniciará receiver");
    return null;
  }

  const conn = runtime.serviceBus.statusConnectionString;
  if (!conn) {
    throw new Error("Connection string de status facial não configurada.");
  }

  if (statusReceiver && activeStatusConn === conn) {
    return statusReceiver;
  }

  if (statusClient && activeStatusConn !== conn) {
    try {
      await statusClient.close();
    } catch {
      /* ignore */
    }
    statusReceiver = null;
    statusClient = null;
  }

  const { ServiceBusClient } = await getServiceBusModule();
  statusClient = new ServiceBusClient(conn);
  statusReceiver = statusClient.createReceiver(runtime.serviceBus.statusQueue, {
    receiveMode: "peekLock",
  });
  activeStatusConn = conn;

  statusReceiver.subscribe(
    {
      processMessage: onMessage,
      processError: onError,
    },
    { autoCompleteMessages: false },
  );

  logger.info(
    { queue: runtime.serviceBus.statusQueue },
    "Receiver facial-enrollment-status ativo",
  );
  return statusReceiver;
}

async function closeClients() {
  try {
    if (commandsSender) await commandsSender.close();
  } catch (err) {
    logger.warn({ err }, "Erro ao fechar commands sender");
  }
  try {
    if (statusReceiver) await statusReceiver.close();
  } catch (err) {
    logger.warn({ err }, "Erro ao fechar status receiver");
  }
  try {
    if (serviceBusClient) await serviceBusClient.close();
  } catch (err) {
    logger.warn({ err }, "Erro ao fechar service bus client");
  }
  try {
    if (statusClient) await statusClient.close();
  } catch (err) {
    logger.warn({ err }, "Erro ao fechar status client");
  }
  resetClients();
}

async function probeConnection() {
  const runtime = await getRuntime();
  const transport = facialGatewayConfig.resolveTransport(runtime);
  if (transport !== "service_bus") {
    return { ok: true, skipped: true, reason: "http_poll" };
  }
  try {
    const sender = await getCommandsSender();
    if (!sender) {
      return { ok: false, reason: "no_sender" };
    }
    return { ok: true };
  } catch (err) {
    logger.warn({ err }, "Falha ao testar conexão Service Bus de comandos");
    return { ok: false, reason: err.message || "service_bus_error" };
  }
}

module.exports = {
  sendCommand,
  createStatusReceiver,
  closeClients,
  resetClients,
  probeConnection,
};
