const auditService = require("./audit.service");
const { logAudit, skipAudit, markAuditLogged } = require("../../utils/auditLogger");
const { AUDIT_MODULES, AUDIT_ACTIONS } = require("../../observability/audit.constants");

function sendXlsx(res, { buffer, filename }) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

exports.list = async (req, res, next) => {
  try {
    skipAudit(req);
    const { page, limit } = auditService.parseListQuery(req.query);
    const filters = auditService.parseAuditFilters(req.query);
    const result = await auditService.listAudit({ page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.filters = async (req, res, next) => {
  try {
    skipAudit(req);
    const result = await auditService.listFilterOptions();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.exportXlsx = async (req, res, next) => {
  try {
    const filters = auditService.parseAuditFilters(req.query);
    const exportResult = await auditService.exportAuditXlsx(filters);

    await logAudit({
      userId: req.user?.id,
      action: AUDIT_ACTIONS.EXPORT,
      module: AUDIT_MODULES.AUDIT,
      req,
      metadata: { type: "audit", rowCount: exportResult.rowCount, filters },
    });
    markAuditLogged(req);

    sendXlsx(res, exportResult);
  } catch (err) {
    next(err);
  }
};
