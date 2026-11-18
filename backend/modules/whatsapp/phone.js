const AppError = require("../../utils/AppError");

/**
 * Normaliza um telefone livre (ex.: "(11) 98888-0001", "+55 11 98888-0001",
 * "5511988880001") para somente dígitos em formato internacional sem "+".
 *
 * Regras (foco Brasil, DDI configurável):
 * - remove tudo que não é dígito;
 * - remove "0" de tronco à esquerda (ex.: "011 98888-0001");
 * - 10 ou 11 dígitos (DDD + número) → prefixa o DDI padrão;
 * - já com DDI (>= 12 dígitos) → mantém.
 *
 * @param {string} phone
 * @param {string} [defaultCountryCode="55"]
 * @returns {string|null} dígitos E.164 sem "+", ou null se inválido
 */
function normalizePhoneDigits(phone, defaultCountryCode = "55") {
  if (phone === null || phone === undefined) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  const cc = String(defaultCountryCode || "55").replace(/\D/g, "") || "55";

  // Remove zero de tronco nacional ("011...") quando não há DDI.
  if (digits.length === 11 || digits.length === 12) {
    if (digits.startsWith("0") && !digits.startsWith(cc)) {
      digits = digits.replace(/^0+/, "");
    }
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = `${cc}${digits}`;
  }

  // E.164: máx 15 dígitos; mínimo razoável 12 (DDI + DDD + 8).
  if (digits.length < 12 || digits.length > 15) return null;
  return digits;
}

/**
 * Converte telefone em chatId do WhatsApp (formato "<digits>@c.us").
 * @throws {AppError} 400 se inválido
 */
function toChatId(phone, defaultCountryCode = "55") {
  const raw = String(phone || "").trim();
  if (/@(c\.us|g\.us|s\.whatsapp\.net|lid)$/i.test(raw)) {
    return raw;
  }
  const digits = normalizePhoneDigits(raw, defaultCountryCode);
  if (!digits) {
    throw new AppError(
      `Telefone inválido para WhatsApp: "${raw}". Use DDD + número (ex.: 11 98888-0001).`,
      400,
    );
  }
  return `${digits}@c.us`;
}

module.exports = { normalizePhoneDigits, toChatId };
