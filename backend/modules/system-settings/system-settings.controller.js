const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const systemSettingsService = require("./system-settings.service");
const {
  sessionSettingsSchema,
  appearanceSettingsSchema,
  eventAccreditationNotifySchema,
  accessScheduleSettingsSchema,
} = require("./system-settings.schema");

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

exports.getAppearanceSettings = async (req, res, next) => {
  try {
    const settings = await systemSettingsService.getAppearanceSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateAppearanceSettings = async (req, res, next) => {
  try {
    const { error, value } = appearanceSettingsSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const settings = await systemSettingsService.updateAppearanceSettings(
      value.color_palette,
    );

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "system_settings",
      req,
      metadata: { color_palette: settings.color_palette },
    });

    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.getEventAccreditationNotifySettings = async (req, res, next) => {
  try {
    const settings = await systemSettingsService.getEventAccreditationNotifySettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateEventAccreditationNotifySettings = async (req, res, next) => {
  try {
    const { error, value } = eventAccreditationNotifySchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const settings = await systemSettingsService.updateEventAccreditationNotifySettings(value);
    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "system_settings",
      req,
      metadata: {
        notify_all: settings.notify_all,
        user_ids: settings.users.map((u) => u.id),
      },
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.listAdInternalUsers = async (req, res, next) => {
  try {
    const users = await systemSettingsService.listAdInternalUsers({
      search: req.query.search,
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
};

exports.getAccessScheduleSettings = async (req, res, next) => {
  try {
    const settings = await systemSettingsService.getAccessScheduleSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateAccessScheduleSettings = async (req, res, next) => {
  try {
    const { error, value } = accessScheduleSettingsSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const settings = await systemSettingsService.updateAccessScheduleSettings(value);

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "system_settings",
      req,
      metadata: {
        comercial_start: settings.comercial_start,
        comercial_end: settings.comercial_end,
        noturno_start: settings.noturno_start,
        noturno_end: settings.noturno_end,
      },
    });

    res.json({ settings });
  } catch (err) {
    next(err);
  }
};
