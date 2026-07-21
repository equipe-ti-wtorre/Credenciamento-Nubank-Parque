const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const companyUsersService = require("./company-users.service");
const {
  companyUserCreateSchema,
  companyUserUpdateSchema,
} = require("./company-users.schema");

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = companyUsersService.parseListQuery(req.query);
    const filters = companyUsersService.parseListFilters(req.query);
    const result = await companyUsersService.listCompanyUsers(req.user, {
      page,
      limit,
      filters,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const user = await companyUsersService.getCompanyUserById(
      req.user,
      req.params.id,
    );
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = companyUserCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { user, invite } = await companyUsersService.createCompanyUser(
      req.user,
      value,
      { usuarioId: req.user?.id, requestId: req.requestId },
    );

    attachAudit(req, {
      action: "CREATE",
      module: "company_users",
      event: "company_users.create",
      resource: { type: "user", id: user.id, email: user.email },
      changes: {
        id_company: user.id_company,
        profile: user.role,
        invited: !!invite,
      },
    });

    res.status(201).json({ user, invite });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = companyUserUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { user, changes } = await companyUsersService.updateCompanyUser(
      req.user,
      req.params.id,
      value,
    );

    let action = "UPDATE";
    if (changes.wasDeactivated) action = "DEACTIVATE";
    else if (changes.wasActivated) action = "ACTIVATE";

    attachAudit(req, {
      action,
      module: "company_users",
      event: `company_users.${action.toLowerCase()}`,
      resource: { type: "user", id: user.id, email: user.email },
      changes,
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.resendInvite = async (req, res, next) => {
  try {
    const { user, invite } = await companyUsersService.resendInvite(
      req.user,
      req.params.id,
      { usuarioId: req.user?.id, requestId: req.requestId },
    );

    attachAudit(req, {
      action: "CREATE",
      module: "company_users",
      event: "company_users.resend_invite",
      resource: { type: "user", id: user.id, email: user.email },
      changes: { email: invite.email },
    });

    res.json({ user, invite });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const removed = await companyUsersService.deleteCompanyUser(
      req.user,
      req.params.id,
    );

    attachAudit(req, {
      action: "DELETE",
      module: "company_users",
      event: "company_users.delete",
      resource: {
        type: "user",
        id: removed.id,
        email: removed.email,
        name: removed.nome_completo,
      },
    });

    res.json({ removed });
  } catch (err) {
    next(err);
  }
};
