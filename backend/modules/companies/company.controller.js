const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const companyService = require("./company.service");
const {
  companyCreateSchema,
  companyUpdateSchema,
  companyStatusSchema,
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
