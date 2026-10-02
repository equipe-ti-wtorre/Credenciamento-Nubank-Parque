const { AUDIT_MODULES, AUDIT_ACTIONS } = require("./audit.constants");

const USERS_API = /^\/api\/(?:v1\/)?users(?:\/|$)/;
const COMPANIES_API = /^\/api\/(?:v1\/)?companies(?:\/|$)/;
const COLLABORATORS_API = /^\/api\/(?:v1\/)?collaborators(?:\/|$)/;
const EVENTS_API = /^\/api\/(?:v1\/)?events(?:\/|$)/;
const CREDENTIALS_API = /^\/api\/(?:v1\/)?credentials(?:\/|$)/;
const GATE_API = /^\/api\/(?:v1\/)?gate(?:\/|$)/;
const APPROVALS_API = /^\/api\/(?:v1\/)?approvals(?:\/|$)/;
const SECTORS_API = /^\/api\/(?:v1\/)?sectors(?:\/|$)/;
const EVENT_ACCREDITATION_API = /^\/api\/(?:v1\/)?event-accreditations(?:\/|$)/;
const COMPANY_USERS_API = /^\/api\/(?:v1\/)?company-users(?:\/|$)/;
const PROFILES_API = /^\/api\/(?:v1\/)?profiles(?:\/|$)/;
const MATERIALS_API = /^\/api\/(?:v1\/)?materials(?:\/|$)/;
const VEHICLES_API = /^\/api\/(?:v1\/)?vehicles(?:\/|$)/;
const SERVICE_ACCESS_API = /^\/api\/(?:v1\/)?patrimonial\/services(?:\/|$)/;
const BLOCKLIST_API = /^\/api\/(?:v1\/)?blocklist(?:\/|$)/;
const ALERTS_API = /^\/api\/(?:v1\/)?alerts(?:\/|$)/;
const REPORTS_API = /^\/api\/(?:v1\/)?reports(?:\/|$)/;
const FACIAL_API = /^\/api\/(?:v1\/)?facial(?:\/|$)/;
const EMAIL_TEMPLATES_API = /^\/api\/(?:v1\/)?email-templates(?:\/|$)/;
const SYSTEM_SETTINGS_API = /^\/api\/(?:v1\/)?system-settings(?:\/|$)/;
const TENANTS_API = /^\/api\/(?:v1\/)?tenants(?:\/|$)/;
const SMTP_API = /^\/api\/(?:v1\/)?smtp(?:\/|$)/;
const TEAMS_API = /^\/api\/(?:v1\/)?teams(?:\/|$)/;

function cleanPath(originalUrl) {
  return (originalUrl || "").split("?")[0];
}

function extractUserId(path) {
  const m = path.match(/\/users\/(\d+)(?:\/|$)/);
  return m ? Number(m[1]) : null;
}

function resolveUsersPolicy(method, path) {
  if (!USERS_API.test(path)) return null;

  const syncDepartments = /\/users\/sync-departments\/?$/;
  const syncAdUsers = /\/users\/sync-ad-users\/?$/;
  const syncAdOne = /\/users\/(\d+)\/sync-ad\/?$/;

  if (method === "POST" && syncDepartments.test(path)) {
    return {
      module: AUDIT_MODULES.USERS,
      action: AUDIT_ACTIONS.SYNC,
      event: "users.sync",
      syncType: "departments",
    };
  }

  if (method === "POST" && syncAdUsers.test(path)) {
    return {
      module: AUDIT_MODULES.USERS,
      action: AUDIT_ACTIONS.SYNC,
      event: "users.sync",
      syncType: "ad-users",
    };
  }

  const syncOne = path.match(syncAdOne);
  if (method === "POST" && syncOne) {
    return {
      module: AUDIT_MODULES.USERS,
      action: AUDIT_ACTIONS.SYNC,
      event: "users.sync",
      syncType: "ad-user",
      resourceId: Number(syncOne[1]),
    };
  }

  if (method === "GET" && /\/users\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.USERS,
      action: AUDIT_ACTIONS.LIST,
      event: "users.list",
    };
  }

  const readMatch = path.match(/\/users\/(\d+)\/?$/);
  if (method === "GET" && readMatch) {
    return {
      module: AUDIT_MODULES.USERS,
      action: AUDIT_ACTIONS.READ,
      event: "users.read",
      resourceId: Number(readMatch[1]),
    };
  }

  if (method === "PATCH" && readMatch) {
    return {
      module: AUDIT_MODULES.USERS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "users.update",
      resourceId: Number(readMatch[1]),
    };
  }

  return null;
}

function resolveCompaniesPolicy(method, path) {
  if (!COMPANIES_API.test(path)) return null;

  if (method === "GET" && /\/companies\/types\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COMPANIES,
      action: AUDIT_ACTIONS.LIST,
      event: "companies.types.list",
      resourceType: "company",
    };
  }

  if (method === "GET" && /\/companies\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COMPANIES,
      action: AUDIT_ACTIONS.LIST,
      event: "companies.list",
      resourceType: "company",
    };
  }

  const readMatch = path.match(/\/companies\/(\d+)\/?$/);
  if (method === "GET" && readMatch) {
    return {
      module: AUDIT_MODULES.COMPANIES,
      action: AUDIT_ACTIONS.READ,
      event: "companies.read",
      resourceId: Number(readMatch[1]),
      resourceType: "company",
    };
  }

  if (method === "POST" && /\/companies\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COMPANIES,
      action: AUDIT_ACTIONS.CREATE,
      event: "companies.create",
      resourceType: "company",
    };
  }

  if (method === "PUT" && readMatch) {
    return {
      module: AUDIT_MODULES.COMPANIES,
      action: AUDIT_ACTIONS.UPDATE,
      event: "companies.update",
      resourceId: Number(readMatch[1]),
      resourceType: "company",
    };
  }

  const statusMatch = path.match(/\/companies\/(\d+)\/status\/?$/);
  if (method === "PATCH" && statusMatch) {
    return {
      module: AUDIT_MODULES.COMPANIES,
      action: AUDIT_ACTIONS.UPDATE,
      event: "companies.status",
      resourceId: Number(statusMatch[1]),
      resourceType: "company",
    };
  }

  return null;
}

function resolveCollaboratorsPolicy(method, path) {
  if (!COLLABORATORS_API.test(path)) return null;

  if (method === "GET" && /\/collaborators\/types\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.LIST,
      event: "collaborators.types.list",
      resourceType: "collaborator",
    };
  }

  if (method === "GET" && /\/collaborators\/roles\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.LIST,
      event: "collaborators.roles.list",
      resourceType: "collaborator",
    };
  }

  if (method === "GET" && /\/collaborators\/search\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.READ,
      event: "collaborators.search",
      resourceType: "collaborator",
    };
  }

  if (method === "GET" && /\/collaborators\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.LIST,
      event: "collaborators.list",
      resourceType: "collaborator",
    };
  }

  const readMatch = path.match(/\/collaborators\/(\d+)\/?$/);
  if (method === "GET" && readMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.READ,
      event: "collaborators.read",
      resourceId: Number(readMatch[1]),
      resourceType: "collaborator",
    };
  }

  if (method === "POST" && /\/collaborators\/bulk\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.CREATE,
      event: "collaborators.bulk_create",
      resourceType: "collaborator_bulk",
    };
  }

  if (method === "POST" && /\/collaborators\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.CREATE,
      event: "collaborators.create",
      resourceType: "collaborator",
    };
  }

  const pictureMatch = path.match(/\/collaborators\/(\d+)\/picture\/?$/);
  if (method === "POST" && pictureMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "collaborators.picture.upload",
      resourceId: Number(pictureMatch[1]),
      resourceType: "collaborator",
    };
  }

  if (method === "PUT" && readMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "collaborators.update",
      resourceId: Number(readMatch[1]),
      resourceType: "collaborator",
    };
  }

  const statusMatch = path.match(/\/collaborators\/(\d+)\/status\/?$/);
  if (method === "PATCH" && statusMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "collaborators.status",
      resourceId: Number(statusMatch[1]),
      resourceType: "collaborator",
    };
  }

  const blocklistMatch = path.match(/\/collaborators\/(\d+)\/blocklist\/?$/);
  if (method === "POST" && blocklistMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.CREATE,
      event: "collaborators.blocklist.add",
      resourceId: Number(blocklistMatch[1]),
      resourceType: "collaborator",
    };
  }

  if (method === "DELETE" && blocklistMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.DEACTIVATE,
      event: "collaborators.blocklist.remove",
      resourceId: Number(blocklistMatch[1]),
      resourceType: "collaborator",
    };
  }

  return null;
}

function resolveEventsPolicy(method, path) {
  if (!EVENTS_API.test(path)) return null;

  if (method === "GET" && /\/events\/types\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.EVENTS,
      action: AUDIT_ACTIONS.LIST,
      event: "events.types.list",
      resourceType: "event",
    };
  }

  if (method === "GET" && /\/events\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.EVENTS,
      action: AUDIT_ACTIONS.LIST,
      event: "events.list",
      resourceType: "event",
    };
  }

  const readMatch = path.match(/\/events\/(\d+)\/?$/);
  if (method === "GET" && readMatch) {
    return {
      module: AUDIT_MODULES.EVENTS,
      action: AUDIT_ACTIONS.READ,
      event: "events.read",
      resourceId: Number(readMatch[1]),
      resourceType: "event",
    };
  }

  if (method === "POST" && /\/events\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.EVENTS,
      action: AUDIT_ACTIONS.CREATE,
      event: "events.create",
      resourceType: "event",
    };
  }

  const addCompanyMatch = path.match(
    /\/events\/days\/(\d+)\/companies\/?$/,
  );
  if (method === "POST" && addCompanyMatch) {
    return {
      module: AUDIT_MODULES.EVENTS,
      action: AUDIT_ACTIONS.CREATE,
      event: "events.days.companies.add",
      resourceId: Number(addCompanyMatch[1]),
      resourceType: "event_day",
    };
  }

  const removeCompanyMatch = path.match(
    /\/events\/days\/companies\/(\d+)\/?$/,
  );
  if (method === "DELETE" && removeCompanyMatch) {
    return {
      module: AUDIT_MODULES.EVENTS,
      action: AUDIT_ACTIONS.DEACTIVATE,
      event: "events.days.companies.remove",
      resourceId: Number(removeCompanyMatch[1]),
      resourceType: "event_day_company",
    };
  }

  return null;
}

function resolveCredentialsPolicy(method, path) {
  if (!CREDENTIALS_API.test(path)) return null;

  if (method === "GET" && /\/credentials\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.CREDENTIALS,
      action: AUDIT_ACTIONS.LIST,
      event: "credentials.list",
      resourceType: "credential",
    };
  }

  const readMatch = path.match(/\/credentials\/(\d+)\/?$/);
  if (method === "GET" && readMatch) {
    return {
      module: AUDIT_MODULES.CREDENTIALS,
      action: AUDIT_ACTIONS.READ,
      event: "credentials.read",
      resourceId: Number(readMatch[1]),
      resourceType: "credential",
    };
  }

  if (method === "POST" && /\/credentials\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.CREDENTIALS,
      action: AUDIT_ACTIONS.CREATE,
      event: "credentials.request",
      resourceType: "credential",
    };
  }

  const statusMatch = path.match(/\/credentials\/(\d+)\/status\/?$/);
  if (method === "PATCH" && statusMatch) {
    return {
      module: AUDIT_MODULES.CREDENTIALS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "credentials.status_update",
      resourceId: Number(statusMatch[1]),
      resourceType: "credential",
    };
  }

  return null;
}

function resolveGatePolicy(method, path) {
  if (!GATE_API.test(path)) return null;

  if (method === "GET" && /\/gate\/events\/today\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.GATE,
      action: AUDIT_ACTIONS.LIST,
      event: "gate.event.today_list",
      resourceType: "credential",
    };
  }

  if (method === "POST" && /\/gate\/events\/validate\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.GATE,
      action: AUDIT_ACTIONS.UPDATE,
      event: "gate.event.validate",
      resourceType: "credential",
    };
  }

  if (method === "POST" && /\/gate\/events\/substitute\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.GATE,
      action: AUDIT_ACTIONS.UPDATE,
      event: "gate.event.substitute",
      resourceType: "credential",
    };
  }

  if (method === "POST" && /\/gate\/services\/validate\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.GATE,
      action: AUDIT_ACTIONS.READ,
      event: "gate.service.validate",
      resourceType: "service_access",
    };
  }

  if (method === "POST" && /\/gate\/services\/substitute\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.GATE,
      action: AUDIT_ACTIONS.UPDATE,
      event: "gate.service.substitute",
      resourceType: "service_access",
    };
  }

  return null;
}

function resolveApprovalsPolicy(method, path) {
  if (!APPROVALS_API.test(path)) return null;

  if (method === "GET" && /\/approvals\/pending\/?$/.test(path)) {
    return { module: AUDIT_MODULES.APPROVALS, action: AUDIT_ACTIONS.LIST, event: "approvals.pending.list" };
  }
  if (method === "GET" && /\/approvals\/mine\/?$/.test(path)) {
    return { module: AUDIT_MODULES.APPROVALS, action: AUDIT_ACTIONS.LIST, event: "approvals.mine.list" };
  }
  const readMatch = path.match(/\/approvals\/(\d+)\/?$/);
  if (method === "GET" && readMatch) {
    return {
      module: AUDIT_MODULES.APPROVALS,
      action: AUDIT_ACTIONS.READ,
      event: "approvals.read",
      resourceId: Number(readMatch[1]),
    };
  }
  const approveMatch = path.match(/\/approvals\/(\d+)\/approve\/?$/);
  if (method === "POST" && approveMatch) {
    return {
      module: AUDIT_MODULES.APPROVALS,
      action: AUDIT_ACTIONS.APPROVE,
      event: "approvals.approve",
      resourceId: Number(approveMatch[1]),
    };
  }
  const rejectMatch = path.match(/\/approvals\/(\d+)\/reject\/?$/);
  if (method === "POST" && rejectMatch) {
    return {
      module: AUDIT_MODULES.APPROVALS,
      action: AUDIT_ACTIONS.REJECT,
      event: "approvals.reject",
      resourceId: Number(rejectMatch[1]),
    };
  }
  const cancelMatch = path.match(/\/approvals\/(\d+)\/cancel\/?$/);
  if (method === "POST" && cancelMatch) {
    return {
      module: AUDIT_MODULES.APPROVALS,
      action: AUDIT_ACTIONS.CANCEL,
      event: "approvals.cancel",
      resourceId: Number(cancelMatch[1]),
    };
  }
  return null;
}

function resolveSectorsPolicy(method, path) {
  if (!SECTORS_API.test(path)) return null;

  if (method === "GET" && /\/sectors\/?$/.test(path)) {
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.LIST, event: "sectors.list" };
  }
  if (method === "POST" && /\/sectors\/?$/.test(path)) {
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.CREATE, event: "sectors.create" };
  }
  const sectorMatch = path.match(/\/sectors\/(\d+)(?:\/|$)/);
  if (
    method === "PUT" &&
    sectorMatch &&
    !path.includes("/members") &&
    !path.includes("/flows") &&
    !path.includes("/contacts")
  ) {
    return {
      module: AUDIT_MODULES.SECTORS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "sectors.update",
      resourceId: Number(sectorMatch[1]),
    };
  }
  if (method === "PATCH" && /\/sectors\/\d+\/status\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/status/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.UPDATE, event: "sectors.status", resourceId: id };
  }
  if (method === "POST" && /\/sectors\/\d+\/members\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/members/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.CREATE, event: "sectors.members.add", resourceId: id };
  }
  if (method === "PATCH" && /\/sectors\/\d+\/members\/\d+\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/members/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.UPDATE, event: "sectors.members.update", resourceId: id };
  }
  if (method === "DELETE" && /\/sectors\/\d+\/members\/\d+\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/members/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.DEACTIVATE, event: "sectors.members.remove", resourceId: id };
  }
  if (method === "PUT" && /\/sectors\/\d+\/flows\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/flows/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.UPDATE, event: "sectors.flows.update", resourceId: id };
  }
  if (method === "GET" && /\/sectors\/\d+\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.READ, event: "sectors.read", resourceId: id };
  }
  if (method === "POST" && /\/sectors\/\d+\/contacts\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/contacts/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.CREATE, event: "sectors.contacts.add", resourceId: id };
  }
  if (method === "PUT" && /\/sectors\/\d+\/contacts\/\d+\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/contacts/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.UPDATE, event: "sectors.contacts.update", resourceId: id };
  }
  if (method === "DELETE" && /\/sectors\/\d+\/contacts\/\d+\/?$/.test(path)) {
    const id = Number(path.match(/\/sectors\/(\d+)\/contacts/)[1]);
    return { module: AUDIT_MODULES.SECTORS, action: AUDIT_ACTIONS.DEACTIVATE, event: "sectors.contacts.remove", resourceId: id };
  }
  return null;
}

function firstNumericId(path, prefix) {
  const m = path.match(new RegExp(`/${prefix}/(\\d+)`));
  return m ? Number(m[1]) : null;
}

function inferRestKind(method, path) {
  if (method === "GET") {
    if (/\/export(?:\/|$)/.test(path)) return "export";
    const last = path.split("/").filter(Boolean).pop() || "";
    return /^\d+$/.test(last) ? "read" : "list";
  }
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "remove";
  return null;
}

function inferRestAction(kind) {
  if (kind === "export") return AUDIT_ACTIONS.EXPORT;
  if (kind === "read") return AUDIT_ACTIONS.READ;
  if (kind === "list") return AUDIT_ACTIONS.LIST;
  if (kind === "create") return AUDIT_ACTIONS.CREATE;
  if (kind === "update") return AUDIT_ACTIONS.UPDATE;
  if (kind === "remove") return AUDIT_ACTIONS.DEACTIVATE;
  return null;
}

function resolvePrefixPolicy(apiRe, module, resourceType, prefix, method, path) {
  if (!apiRe.test(path)) return null;
  const kind = inferRestKind(method, path);
  const action = inferRestAction(kind);
  if (!action) return null;
  const resourceId = firstNumericId(path, prefix);
  return {
    module,
    action,
    event: `${module}.${kind}`,
    resourceType,
    ...(resourceId != null ? { resourceId } : {}),
  };
}

function resolveEventAccreditationPolicy(method, path) {
  return resolvePrefixPolicy(
    EVENT_ACCREDITATION_API,
    AUDIT_MODULES.EVENT_ACCREDITATION,
    "event_accreditation",
    "event-accreditations",
    method,
    path,
  );
}

function resolveCompanyUsersPolicy(method, path) {
  return resolvePrefixPolicy(
    COMPANY_USERS_API,
    AUDIT_MODULES.COMPANY_USERS,
    "company_user",
    "company-users",
    method,
    path,
  );
}

function resolveProfilesPolicy(method, path) {
  return resolvePrefixPolicy(
    PROFILES_API,
    AUDIT_MODULES.PROFILES,
    "profile",
    "profiles",
    method,
    path,
  );
}

function resolveMaterialsPolicy(method, path) {
  return resolvePrefixPolicy(
    MATERIALS_API,
    AUDIT_MODULES.MATERIALS,
    "material",
    "materials",
    method,
    path,
  );
}

function resolveVehiclesPolicy(method, path) {
  return resolvePrefixPolicy(
    VEHICLES_API,
    AUDIT_MODULES.PATRIMONIAL,
    "vehicle",
    "vehicles",
    method,
    path,
  );
}

function resolveServiceAccessPolicy(method, path) {
  return resolvePrefixPolicy(
    SERVICE_ACCESS_API,
    AUDIT_MODULES.PATRIMONIAL,
    "service_access",
    "services",
    method,
    path,
  );
}

function resolveBlocklistPolicy(method, path) {
  return resolvePrefixPolicy(
    BLOCKLIST_API,
    AUDIT_MODULES.BLOCKLIST,
    "blocklist",
    "blocklist",
    method,
    path,
  );
}

function resolveAlertsPolicy(method, path) {
  return resolvePrefixPolicy(
    ALERTS_API,
    AUDIT_MODULES.ALERTS,
    "alert",
    "alerts",
    method,
    path,
  );
}

function resolveReportsPolicy(method, path) {
  return resolvePrefixPolicy(
    REPORTS_API,
    AUDIT_MODULES.REPORTS,
    "report",
    "reports",
    method,
    path,
  );
}

function resolveFacialPolicy(method, path) {
  return resolvePrefixPolicy(
    FACIAL_API,
    AUDIT_MODULES.FACIAL_SETTINGS,
    "facial",
    "facial",
    method,
    path,
  );
}

function resolveEmailTemplatesPolicy(method, path) {
  return resolvePrefixPolicy(
    EMAIL_TEMPLATES_API,
    AUDIT_MODULES.EMAIL_TEMPLATES,
    "email_template",
    "email-templates",
    method,
    path,
  );
}

function resolveSystemSettingsPolicy(method, path) {
  return resolvePrefixPolicy(
    SYSTEM_SETTINGS_API,
    AUDIT_MODULES.SYSTEM_SETTINGS,
    "system_setting",
    "system-settings",
    method,
    path,
  );
}

function resolveTenantsPolicy(method, path) {
  return resolvePrefixPolicy(
    TENANTS_API,
    AUDIT_MODULES.TENANTS,
    "tenant",
    "tenants",
    method,
    path,
  );
}

function resolveSmtpPolicy(method, path) {
  return resolvePrefixPolicy(
    SMTP_API,
    AUDIT_MODULES.SMTP,
    "smtp",
    "smtp",
    method,
    path,
  );
}

function resolveTeamsPolicy(method, path) {
  if (!TEAMS_API.test(path)) return null;
  if (/\/teams\/bot(?:\/|$)/.test(path)) return null;
  return resolvePrefixPolicy(
    TEAMS_API,
    AUDIT_MODULES.TEAMS,
    "teams",
    "teams",
    method,
    path,
  );
}

function resolveAuditPolicy(req) {
  const path = cleanPath(req.originalUrl);
  const method = req.method;
  return (
    resolveUsersPolicy(method, path) ||
    resolveCompaniesPolicy(method, path) ||
    resolveCollaboratorsPolicy(method, path) ||
    resolveEventsPolicy(method, path) ||
    resolveCredentialsPolicy(method, path) ||
    resolveGatePolicy(method, path) ||
    resolveApprovalsPolicy(method, path) ||
    resolveSectorsPolicy(method, path) ||
    resolveEventAccreditationPolicy(method, path) ||
    resolveCompanyUsersPolicy(method, path) ||
    resolveProfilesPolicy(method, path) ||
    resolveMaterialsPolicy(method, path) ||
    resolveVehiclesPolicy(method, path) ||
    resolveServiceAccessPolicy(method, path) ||
    resolveBlocklistPolicy(method, path) ||
    resolveAlertsPolicy(method, path) ||
    resolveReportsPolicy(method, path) ||
    resolveFacialPolicy(method, path) ||
    resolveEmailTemplatesPolicy(method, path) ||
    resolveSystemSettingsPolicy(method, path) ||
    resolveTenantsPolicy(method, path) ||
    resolveSmtpPolicy(method, path) ||
    resolveTeamsPolicy(method, path)
  );
}

function isAuthLoginPath(path) {
  const clean = cleanPath(path);
  return (
    /^\/api\/(?:v1\/)?auth\/login\/?$/.test(clean) ||
    /^\/api\/(?:v1\/)?auth\/login-microsoft\/?$/.test(clean)
  );
}

module.exports = {
  resolveAuditPolicy,
  isAuthLoginPath,
  cleanPath,
};
