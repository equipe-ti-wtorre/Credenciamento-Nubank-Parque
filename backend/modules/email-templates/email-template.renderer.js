function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Substitui {{chave}} no texto. Por padrão escapa HTML nos valores.
 * rawKeys: chaves interpoladas sem escape (uso interno controlado).
 */
function interpolate(template, vars = {}, { rawKeys = [] } = {}) {
  const source = String(template ?? "");
  const rawSet = new Set(rawKeys);
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (!(key in vars) || vars[key] == null) return "";
    const value = String(vars[key]);
    return rawSet.has(key) ? value : escapeHtml(value);
  });
}

function renderFields(templateRow, vars = {}, options = {}) {
  const subject = interpolate(templateRow.assunto, vars, options);
  const html = interpolate(templateRow.corpo_html, vars, options);
  const textSource =
    templateRow.corpo_texto != null && String(templateRow.corpo_texto).trim() !== ""
      ? templateRow.corpo_texto
      : null;
  // Corpo texto: sem escape HTML (é plain text)
  const text = textSource
    ? interpolate(textSource, vars, { rawKeys: Object.keys(vars) })
    : null;
  return { subject, html, text };
}

module.exports = {
  escapeHtml,
  interpolate,
  renderFields,
};
