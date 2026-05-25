const AppError = require("./AppError");

const DEPARTMENT_REQUIRED_MESSAGE =
  "Acesso negado: é necessário ter departamento cadastrado no Azure AD para usar o sistema.";

function hasValidDepartment(departamento) {
  return departamento != null && String(departamento).trim() !== "";
}

function assertUserCanAccess(user) {
  if (!user) return;
  if (!hasValidDepartment(user.departamento)) {
    throw new AppError(DEPARTMENT_REQUIRED_MESSAGE, 403);
  }
}

/** Condição SQL para usuários elegíveis (com departamento). */
const SQL_HAS_DEPARTMENT = "departamento IS NOT NULL AND TRIM(departamento) <> ''";

module.exports = {
  DEPARTMENT_REQUIRED_MESSAGE,
  hasValidDepartment,
  assertUserCanAccess,
  SQL_HAS_DEPARTMENT,
};
