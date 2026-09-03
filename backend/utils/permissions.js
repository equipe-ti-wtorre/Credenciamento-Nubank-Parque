const { permissionKey } = require("../config/modules.config");
const AppError = require("./AppError");

function isSuperAdmin(user) {
  return !!user?.is_super_admin;
}

function hasPermission(user, modulo, acao) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const key = permissionKey(modulo, acao);
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(key);
  }
  if (user.permissions instanceof Set) {
    return user.permissions.has(key);
  }
  return false;
}

function hasAnyPermission(user, entries) {
  return entries.some(({ modulo, acao }) => hasPermission(user, modulo, acao));
}

function assertPermission(user, modulo, acao, message = "Permissão insuficiente.") {
  if (!hasPermission(user, modulo, acao)) {
    throw new AppError(message, 403);
  }
}

function permissionsFromRows(rows) {
  return rows.map((r) => permissionKey(r.modulo, r.acao));
}

function getProfileCodigo(user) {
  return String(user?.role || user?.perfil || user?.profile?.codigo || "USER").toUpperCase();
}

function isAdUserFlag(user) {
  return user?.is_ad_user === true || Number(user?.is_ad_user) === 1;
}

function isAdInternalUser(user) {
  if (!user) return false;
  if (!isAdUserFlag(user)) return false;
  if (user.id_company != null) return false;
  if (user.requires_company || user.profile?.requires_company) return false;
  return true;
}

function buildCompanyScope(user) {
  const idCompany = user?.id_company != null ? Number(user.id_company) : null;

  if (isSuperAdmin(user)) {
    return { mode: "admin" };
  }

  if (user?.requires_company) {
    if (!idCompany) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    const codigo = getProfileCodigo(user);
    if (
      codigo === "PADRAO" ||
      codigo === "EMPRESA_GESTOR" ||
      codigo === "EMPRESA_SOLICITANTE"
    ) {
      return { mode: "padrao", onlyCompanyId: idCompany };
    }
    return { mode: "produtora", ownCompanyId: idCompany };
  }

  throw new AppError("Perfil sem permissão para consultar empresas.", 403);
}

function buildEventScope(user) {
  const idCompany = user?.id_company != null ? Number(user.id_company) : null;

  if (isSuperAdmin(user)) {
    return { mode: "admin" };
  }

  if (user?.requires_company && hasPermission(user, "events", "view")) {
    if (!idCompany) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    return { mode: "company", companyId: idCompany };
  }

  if (hasPermission(user, "events", "view")) {
    return { mode: "admin" };
  }

  if (hasPermission(user, "approvals", "view") && user?.id) {
    return { mode: "sector_approver", userId: Number(user.id) };
  }

  throw new AppError("Perfil sem permissão para consultar eventos.", 403);
}

function buildAccreditationScope(user) {
  const idCompany = user?.id_company != null ? Number(user.id_company) : null;
  const includeInternal = isAdInternalUser(user);

  if (isSuperAdmin(user)) {
    return { mode: "admin", includeInternal };
  }

  if (user?.requires_company && hasPermission(user, "event_accreditation", "view")) {
    if (!idCompany) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    return { mode: "company", companyId: idCompany, includeInternal: false };
  }

  if (hasPermission(user, "event_accreditation", "view")) {
    return { mode: "admin", includeInternal };
  }

  if (hasPermission(user, "approvals", "view") && user?.id) {
    return {
      mode: "sector_approver",
      userId: Number(user.id),
      includeInternal,
    };
  }

  if (includeInternal && user?.id) {
    return { mode: "internal", userId: Number(user.id), includeInternal: true };
  }

  throw new AppError("Perfil sem permissão para consultar o credenciamento de eventos.", 403);
}

function canAccessAccreditation(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (hasPermission(user, "event_accreditation", "view")) return true;
  if (hasPermission(user, "approvals", "view")) return true;
  return isAdInternalUser(user);
}

module.exports = {
  isSuperAdmin,
  hasPermission,
  hasAnyPermission,
  assertPermission,
  permissionsFromRows,
  getProfileCodigo,
  isAdInternalUser,
  canAccessAccreditation,
  buildCompanyScope,
  buildEventScope,
  buildAccreditationScope,
};
