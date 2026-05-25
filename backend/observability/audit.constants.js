const AUDIT_MODULES = {
  USERS: "users",
  AUTH: "auth",
  TENANTS: "tenants",
  SMTP: "smtp",
  TEAMS: "teams",
  SYSTEM_REPORTS: "system-reports",
  COMPANIES: "companies",
  COLLABORATORS: "collaborators",
  EVENTS: "events",
  CREDENTIALS: "credentials",
};

const AUDIT_ACTIONS = {
  LIST: "LIST",
  READ: "READ",
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DEACTIVATE: "DEACTIVATE",
  ACTIVATE: "ACTIVATE",
  SYNC: "SYNC",
  LOGIN: "LOGIN",
  LOGIN_MICROSOFT: "LOGIN_MICROSOFT",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  EXPORT: "EXPORT",
};

const AUDIT_OUTCOMES = {
  SUCCESS: "success",
  FAILURE: "failure",
};

const MAX_METADATA_BYTES = 16 * 1024;

const LOGIN_FAILURE_STATUS_CODES = new Set([401, 403]);

module.exports = {
  AUDIT_MODULES,
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  MAX_METADATA_BYTES,
  LOGIN_FAILURE_STATUS_CODES,
};
