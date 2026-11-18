"use strict";

const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const { parseEnrollmentStatus } = require("./facial.contract");
const { claimJobsSchema, enrollmentStatusSchema } = require("./facial.schema");
const facialGatewayConfig = require("./facial-gateway-config.service");
const enrollmentService = require("./facial.enrollment.service");
const jobsService = require("./facial.jobs.service");

const logger = child({ module: "facial-gateway" });

async function health(req, res, next) {
  try {
    const runtime = await facialGatewayConfig.getRuntimeConfig();
    const transport = facialGatewayConfig.resolveTransport(runtime);
    res.json({
      ok: true,
      memoryStore: false,
      enabled: !!runtime.enabled,
      transport,
    });
  } catch (err) {
    next(err);
  }
}

async function claimJobs(req, res, next) {
  try {
    const { error, value } = claimJobsSchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      throw new AppError(error.details.map((d) => d.message).join("; "), 400);
    }

    const devicesService = require("./facial.devices.service");
    if (await devicesService.hasEnabled()) {
      res.json({ jobs: [], transport: "direct_dahua" });
      return;
    }

    const jobs = await jobsService.claimJobs(value.limit);
    logger.info({ count: jobs.length }, "HTTP poll: job(s) claimados do Gateway");
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

async function listQueuedJobs(req, res, next) {
  try {
    const rawLimit =
      req.body && req.body.limit != null ? req.body.limit : req.query?.limit;
    const { error, value } = claimJobsSchema.validate(
      rawLimit != null ? { limit: rawLimit } : {},
      { abortEarly: false },
    );
    if (error) {
      throw new AppError(error.details.map((d) => d.message).join("; "), 400);
    }

    const result = await jobsService.listQueuedJobs(value.limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function handleEnrollmentStatus(req, res, next) {
  try {
    const { error, value } = enrollmentStatusSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: false,
    });
    if (error) {
      throw new AppError(error.details.map((d) => d.message).join("; "), 400);
    }

    const parsed = parseEnrollmentStatus(value);
    if (!parsed.ok) {
      throw new AppError(parsed.error || "Payload enrollment-status inválido", 400);
    }

    const result = await enrollmentService.applyEnrollmentStatus(parsed);

    attachAudit(req, {
      action: "UPDATE",
      module: "facial",
      event: "facial.enrollment_status",
      resource: {
        type: "collaborator",
        id: result.collaboratorId,
      },
      metadata: {
        correlationId: parsed.correlationId,
        overallStatus: parsed.overallStatus,
        command: parsed.command,
      },
    });

    res.status(200).json({
      received: true,
      collaboratorId: result.collaboratorId,
      facialStatus: result.facialStatus,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  health,
  claimJobs,
  listQueuedJobs,
  handleEnrollmentStatus,
};
