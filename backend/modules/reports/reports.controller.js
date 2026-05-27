const reportsService = require("./reports.service");

exports.dashboard = async (req, res, next) => {
  try {
    const metrics = await reportsService.getDashboardMetrics(req);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
};
