"use strict";

/** Calendar day key (YYYY-MM-DD). With mysql2 dateStrings, DATETIME arrives as string. */
function toDateKey(value) {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isTimestampToday(value, todayKey) {
  if (!value || !todayKey) return false;
  return toDateKey(value) === todayKey;
}

function hasOpenStay(row) {
  return !!(row && row.access_check_in && !row.access_check_out);
}

/** end_date do acesso de serviço já passou (hoje > último dia autorizado). */
function isServicePeriodEnded(endDate, todayKey) {
  const endKey = toDateKey(endDate);
  return !!(endKey && todayKey && endKey < todayKey);
}

function isCheckoutListAction(action) {
  return action === "CHECK_OUT" || action === "PERIOD_EXPIRED";
}

/** Liberação da portaria no dia — facial_released_at (não o CHECK_IN). */
function wasReleasedToday(row, todayKey) {
  if (!row) return false;
  if (isTimestampToday(row.facial_released_at, todayKey)) return true;
  return !!row.released_today;
}

function resolveEventNextAction(row) {
  if (row.access_check_in && !row.access_check_out) return "CHECK_OUT";
  return "CHECK_IN";
}

function resolveServiceCollaboratorNextAction(row) {
  if (row.access_check_in && !row.access_check_out) return "CHECK_OUT";
  return "CHECK_IN";
}

/**
 * Ação exibida na lista da portaria (liberar / aguardar facial / saída / expirado).
 * options.periodEnded: força expirado (eventos fora da janela operacional).
 * Sem option, usa end_date < todayKey (acesso de serviço).
 */
function resolvePortariaListAction(row, todayKey, options = {}) {
  if (hasOpenStay(row)) {
    const periodEnded =
      options.periodEnded != null
        ? !!options.periodEnded
        : isServicePeriodEnded(row.end_date, todayKey);
    if (periodEnded) return "PERIOD_EXPIRED";
    return "CHECK_OUT";
  }
  if (!wasReleasedToday(row, todayKey)) return "RELEASE_ACCESS";
  return "CHECK_IN";
}

/**
 * Escolhe o registro de portaria para uma ação forçada (facial).
 * Saída: fecha permanência aberta (serviço primeiro).
 * Entrada: só se a portaria já liberou hoje e não houver stay aberto.
 */
function selectCollaboratorGateTarget(action, { serviceRows = [], eventRows = [], todayKey } = {}) {
  const services = Array.isArray(serviceRows) ? serviceRows : [];
  const events = Array.isArray(eventRows) ? eventRows : [];
  const openService = services.find(hasOpenStay);
  const openEvent = events.find(hasOpenStay);

  if (action === "CHECK_OUT") {
    if (openService) return { type: "SERVICE", row: openService };
    if (openEvent) return { type: "EVENT", row: openEvent };
    return { empty: true };
  }

  if (action !== "CHECK_IN") {
    return { empty: true };
  }

  if (openService || openEvent) {
    return { blocked: "OPEN_STAY_PENDING" };
  }

  const releasedServices = services.filter((row) => wasReleasedToday(row, todayKey));
  const releasedEvents = events.filter((row) => wasReleasedToday(row, todayKey));

  for (const row of releasedServices) {
    if (resolveServiceCollaboratorNextAction(row) === "CHECK_IN") {
      return { type: "SERVICE", row };
    }
  }
  for (const row of releasedEvents) {
    if (resolveEventNextAction(row) === "CHECK_IN") {
      return { type: "EVENT", row };
    }
  }

  if (services.length || events.length) {
    return { blocked: "FACIAL_ENTRY_NOT_RELEASED" };
  }
  return { empty: true };
}

module.exports = {
  toDateKey,
  isTimestampToday,
  hasOpenStay,
  isServicePeriodEnded,
  isCheckoutListAction,
  wasReleasedToday,
  resolveEventNextAction,
  resolveServiceCollaboratorNextAction,
  resolvePortariaListAction,
  selectCollaboratorGateTarget,
};
