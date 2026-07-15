const profilesService = require("./profiles.service");
const { profileCreateSchema, profileUpdateSchema } = require("./profiles.schema");
const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");

exports.list = async (req, res, next) => {
  try {
    const profiles = await profilesService.listProfiles();
    res.json({ profiles });
  } catch (err) {
    next(err);
  }
};

exports.getModules = async (req, res, next) => {
  try {
    res.json(profilesService.getModulesCatalog());
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const profile = await profilesService.getProfileById(req.params.id);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = profileCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const profile = await profilesService.createProfile(value);
    attachAudit(req, {
      action: "CREATE",
      event: "profiles.create",
      resource: { type: "profile", id: profile.id, nome: profile.nome },
    });
    res.status(201).json({ profile });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = profileUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const profile = await profilesService.updateProfile(req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      event: "profiles.update",
      resource: { type: "profile", id: profile.id, nome: profile.nome },
    });
    res.json({ profile });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const profile = await profilesService.getProfileById(req.params.id);
    await profilesService.deleteProfile(req.params.id);
    attachAudit(req, {
      action: "DELETE",
      event: "profiles.delete",
      resource: { type: "profile", id: profile.id, nome: profile.nome },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
