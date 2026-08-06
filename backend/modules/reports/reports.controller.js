const reportsService = require("./reports.service");

function sendXlsx(res, { buffer, filename }) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

function parseAccessFilters(query = {}) {
  return {
    id_event: query.id_event,
    id_company: query.id_company,
    date_from: query.date_from,
    date_to: query.date_to,
    source: query.source,
    status: query.status,
    q: query.q,
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    const metrics = await reportsService.getDashboardMetrics(req);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
};

exports.denials = async (req, res, next) => {
  try {
    const rows = await reportsService.getDenials({
      id_event: req.query.id_event,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      module: req.query.module,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};

exports.accesses = async (req, res, next) => {
  try {
    const result = await reportsService.getAccesses(req, parseAccessFilters(req.query));
    res.json({ data: result.rows, summary: result.summary });
  } catch (err) {
    next(err);
  }
};

exports.exportAccesses = async (req, res, next) => {
  try {
    const exportResult = await reportsService.exportAccessesXlsx(
      req,
      parseAccessFilters(req.query),
    );
    sendXlsx(res, exportResult);
  } catch (err) {
    next(err);
  }
};
