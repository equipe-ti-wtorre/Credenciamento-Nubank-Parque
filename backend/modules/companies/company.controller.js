const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const companyService = require("./company.service");
const {
  companyCreateSchema,
  companyUpdateSchema,
  companyStatusSchema,
  companyInviteAccessSchema,
} = require("./company.schema");

exports.listTypes = async (req, res, next) => {
  try {
    const types = await companyService.listCompanyTypes();
    res.json({ types });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = companyService.parseListQuery(req.query);
    const filters = companyService.parseListFilters(req.query);
    const result = await companyService.listCompanies(req, { page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const company = await companyService.getCompanyById(req, req.params.id);
    res.json({ company });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = companyCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const company = await companyService.createCompany(value);

    attachAudit(req, {
      action: "CREATE",
      module: "companies",
      event: "companies.create",
      resource: {
        type: "company",
        id: company.id_company,
        cnpj: company.cnpj,
      },
      changes: {
        company_name: company.company_name,
        id_company_type: company.id_company_type,
      },
    });

    res.status(201).json({ company });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("CNPJ já cadastrado.", 409));
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = companyUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const company = await companyService.updateCompany(req.params.id, value);

    attachAudit(req, {
      action: "UPDATE",
      module: "companies",
      event: "companies.update",
      resource: {
        type: "company",
        id: company.id_company,
        cnpj: company.cnpj,
      },
      changes: value,
    });

    res.json({ company });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("CNPJ já cadastrado.", 409));
    }
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = companyStatusSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { company, changes } = await companyService.updateCompanyStatus(
      req.params.id,
      value.status,
    );

    let action = "UPDATE";
    if (changes.wasDeactivated) action = "DEACTIVATE";
    else if (changes.wasActivated) action = "ACTIVATE";

    attachAudit(req, {
      action,
      module: "companies",
      event: `companies.${action.toLowerCase()}`,
      resource: {
        type: "company",
        id: company.id_company,
        cnpj: company.cnpj,
      },
      changes: { status: company.status, ...changes },
    });

    res.json({ company });
  } catch (err) {
    next(err);
  }
};

exports.inviteAccess = async (req, res, next) => {
  try {
    const { error, value } = companyInviteAccessSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await companyService.inviteCompanyAccess(req.params.id, value, {
      usuarioId: req.user?.id,
      requestId: req.requestId,
    });

    attachAudit(req, {
      action: "CREATE",
      module: "companies",
      event: "companies.invite_access",
      resource: {
        type: "company",
        id: Number(req.params.id),
      },
      changes: {
        email: result.email,
        id_usuario: result.id_usuario,
        profile_codigo: result.profile_codigo,
      },
    });

    res.json({ invite: result });
  } catch (err) {
    next(err);
  }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    const path = require("path");
    const fs = require("fs");
    const { v4: uuidv4 } = require("uuid");

    if (!req.file) {
      throw new AppError("Envie o arquivo do logo.", 400);
    }

    const storageDir = path.join(__dirname, "../../storage/company-logos");
    fs.mkdirSync(storageDir, { recursive: true });

    const ext = path.extname(req.file.originalname || ".jpg").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const filename = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(storageDir, filename), req.file.buffer);

    const company = await companyService.updateCompanyLogo(req.params.id, filename);

    attachAudit(req, {
      action: "UPDATE",
      module: "companies",
      event: "company.logo.upload",
      resource: { type: "company", id: company.id_company },
      changes: { logo: filename },
    });

    res.json({ company, logo: filename });
  } catch (err) {
    next(err);
  }
};
