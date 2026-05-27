const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const systemSettingsService = require("./system-settings.service");
const { sessionSettingsSchema } = require("./system-settings.schema");

exports.getSessionSettings = async (req, res, next) => {
  try {
    const settings = await systemSettingsService.getSessionSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSessionSettings = async (req, res, next) => {
  try {
    const { error, value } = sessionSettingsSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const settings = await systemSettingsService.updateSessionSettings(
      value.session_idle_minutes,
    );

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "system_settings",
      req,
      metadata: { session_idle_minutes: settings.session_idle_minutes },
    });

    res.json({ settings });
  } catch (err) {
    next(err);
  }
};
