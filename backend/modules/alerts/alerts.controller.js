const AppError = require("../../utils/AppError");
const alertsService = require("./alerts.service");
const { listQuerySchema, idParamSchema } = require("./alerts.schema");

exports.list = async (req, res, next) => {
  try {
    const { error, value } = listQuerySchema.validate(req.query, {
      abortEarly: true,
      convert: true,
    });
    if (error) throw new AppError(error.details[0].message, 400);

    await alertsService.syncInboxAlertsForUser(req.user);
    const result = await alertsService.listAlerts(req.user.id, value);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.unreadCount = async (req, res, next) => {
  try {
    await alertsService.syncInboxAlertsForUser(req.user);
    const total = await alertsService.countUnread(req.user.id);
    res.json({ total });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const { error, value } = idParamSchema.validate(req.params, {
      abortEarly: true,
      convert: true,
    });
    if (error) throw new AppError(error.details[0].message, 400);

    const alert = await alertsService.markRead(req.user.id, value.id);
    res.json({ alert });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const result = await alertsService.markAllRead(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { error, value } = idParamSchema.validate(req.params, {
      abortEarly: true,
      convert: true,
    });
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await alertsService.deleteAlert(req.user.id, value.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.removeAll = async (req, res, next) => {
  try {
    const result = await alertsService.deleteAllAlerts(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
