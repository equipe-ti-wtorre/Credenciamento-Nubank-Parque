const usersService = require("./users.service");
const { userUpdateSchema } = require("./users.schema");
const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = usersService.parseListQuery(req.query);
    const filters = usersService.parseListFilters(req.query);
    const result = await usersService.listUsers({ page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const user = await usersService.getUserById(req.params.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = userUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { user, changes } = await usersService.updateUser(
      req.params.id,
      value,
      req.user?.id,
    );

    let action = "UPDATE";
    if (changes.wasDeactivated) action = "DEACTIVATE";
    else if (changes.wasActivated) action = "ACTIVATE";

    attachAudit(req, {
      action,
      event: `users.${action.toLowerCase()}`,
      resource: {
        type: "user",
        id: user.id,
        email: user.email,
      },
      changes: {
        perfil: user.role,
        ativo: user.ativo,
        ...changes,
      },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.syncDepartments = async (req, res, next) => {
  try {
    const result = await usersService.syncDepartments();
    attachAudit(req, {
      action: "SYNC",
      event: "users.sync",
      metadata: { type: "departments", ...result },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.syncAdUsers = async (req, res, next) => {
  try {
    const result = await usersService.syncAdUsers();
    if (result.alreadyRunning) {
      return res.status(409).json(result);
    }
    attachAudit(req, {
      action: "SYNC",
      event: "users.sync",
      metadata: { type: "ad-users", ...result },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.syncUserDepartment = async (req, res, next) => {
  try {
    const user = await usersService.syncUserDepartment(req.params.id);
    attachAudit(req, {
      action: "SYNC",
      event: "users.sync",
      resource: { type: "user", id: user.id, email: user.email },
      metadata: { type: "ad-user" },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};
