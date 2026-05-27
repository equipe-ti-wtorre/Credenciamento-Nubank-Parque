const { AUDIT_MODULES, AUDIT_ACTIONS } = require("./audit.constants");

const USERS_API = /^\/api\/(?:v1\/)?users(?:\/|$)/;
const COMPANIES_API = /^\/api\/(?:v1\/)?companies(?:\/|$)/;
const COLLABORATORS_API = /^\/api\/(?:v1\/)?collaborators(?:\/|$)/;
const EVENTS_API = /^\/api\/(?:v1\/)?events(?:\/|$)/;
const CREDENTIALS_API = /^\/api\/(?:v1\/)?credentials(?:\/|$)/;
const GATE_API = /^\/api\/(?:v1\/)?gate(?:\/|$)/;

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

  if (method === "GET" && /\/collaborators\/document-change\/pending\/?$/.test(path)) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.LIST,
      event: "collaborators.document_change.pending",
      resourceType: "document_change_request",
    };
  }

  const docChangeStatusMatch = path.match(/\/collaborators\/document-change\/(\d+)\/status\/?$/);
  if (method === "PATCH" && docChangeStatusMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.UPDATE,
      event: "collaborators.document_change.status",
      resourceId: Number(docChangeStatusMatch[1]),
      resourceType: "document_change_request",
    };
  }

  const docChangeCreateMatch = path.match(/\/collaborators\/(\d+)\/document-change\/?$/);
  if (method === "POST" && docChangeCreateMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.CREATE,
      event: "collaborators.document_change.request",
      resourceId: Number(docChangeCreateMatch[1]),
      resourceType: "document_change_request",
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

  const blacklistMatch = path.match(/\/collaborators\/(\d+)\/blacklist\/?$/);
  if (method === "POST" && blacklistMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.CREATE,
      event: "collaborators.blacklist.add",
      resourceId: Number(blacklistMatch[1]),
      resourceType: "collaborator",
    };
  }

  if (method === "DELETE" && blacklistMatch) {
    return {
      module: AUDIT_MODULES.COLLABORATORS,
      action: AUDIT_ACTIONS.DEACTIVATE,
      event: "collaborators.blacklist.remove",
      resourceId: Number(blacklistMatch[1]),
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

function resolveAuditPolicy(req) {
  const path = cleanPath(req.originalUrl);
  const method = req.method;
  return (
    resolveUsersPolicy(method, path) ||
    resolveCompaniesPolicy(method, path) ||
    resolveCollaboratorsPolicy(method, path) ||
    resolveEventsPolicy(method, path) ||
    resolveCredentialsPolicy(method, path) ||
    resolveGatePolicy(method, path)
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
