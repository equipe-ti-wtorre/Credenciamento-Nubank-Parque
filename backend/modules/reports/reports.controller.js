const reportsService = require("./reports.service");

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
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};
