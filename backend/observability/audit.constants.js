const AUDIT_MODULES = {
  USERS: "users",
  AUTH: "auth",
  TENANTS: "tenants",
  SMTP: "smtp",
  TEAMS: "teams",
  SYSTEM_REPORTS: "system-reports",
  SYSTEM_SETTINGS: "system_settings",
  EMAIL_TEMPLATES: "email_templates",
  COMPANIES: "companies",
  COLLABORATORS: "collaborators",
  EVENTS: "events",
  CREDENTIALS: "credentials",
  GATE: "gate",
  APPROVALS: "approvals",
  SECTORS: "sectors",
  EVENT_ACCREDITATION: "event_accreditation",
  COMPANY_USERS: "company_users",
  PROFILES: "profiles",
  MATERIALS: "materials",
  PATRIMONIAL: "patrimonial",
  VEHICLES: "vehicles",
  SERVICE_ACCESS: "service-access",
  BLOCKLIST: "collaborator_blocklist",
  FACIAL: "facial",
  FACIAL_SETTINGS: "facial_settings",
  ALERTS: "alerts",
  REPORTS: "reports",
  AUDIT: "audit",
};

const AUDIT_ACTIONS = {
  LIST: "LIST",
  READ: "READ",
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  DEACTIVATE: "DEACTIVATE",
  ACTIVATE: "ACTIVATE",
  SYNC: "SYNC",
  LOGIN: "LOGIN",
  LOGIN_MICROSOFT: "LOGIN_MICROSOFT",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  EXPORT: "EXPORT",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  CANCEL: "CANCEL",
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
