const systemReportsService = require("./system-reports.service");
const { logAudit } = require("../../utils/auditLogger");

function sendXlsx(res, { buffer, filename }) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

exports.listAudit = async (req, res, next) => {
  try {
    const { page, limit } = systemReportsService.parseListQuery(req.query);
    const filters = systemReportsService.parseAuditFilters(req.query);
    const result = await systemReportsService.listAudit({ page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.listErrors = async (req, res, next) => {
  try {
    const { page, limit } = systemReportsService.parseListQuery(req.query);
    const filters = systemReportsService.parseErrorFilters(req.query);
    const result = await systemReportsService.listErrors({ page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.exportAudit = async (req, res, next) => {
  try {
    const filters = systemReportsService.parseAuditFilters(req.query);
    const exportResult = await systemReportsService.exportAuditXlsx(filters);

    await logAudit({
      userId: req.user?.id,
      action: "EXPORT",
      module: "system-reports",
      req,
      metadata: { type: "audit", rowCount: exportResult.rowCount, filters },
    });

    sendXlsx(res, exportResult);
  } catch (err) {
    next(err);
  }
};

exports.exportErrors = async (req, res, next) => {
  try {
    const filters = systemReportsService.parseErrorFilters(req.query);
    const exportResult = await systemReportsService.exportErrorsXlsx(filters);

    await logAudit({
      userId: req.user?.id,
      action: "EXPORT",
      module: "system-reports",
      req,
      metadata: { type: "errors", rowCount: exportResult.rowCount, filters },
    });

    sendXlsx(res, exportResult);
  } catch (err) {
    next(err);
  }
};
