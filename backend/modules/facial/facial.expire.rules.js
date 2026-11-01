"use strict";

/**
 * Fim do acesso + prazo extra. `dateKey` é YYYY-MM-DD; o instante base é 23:59:59 desse dia.
 */
function periodEndPlusGrace(dateKey, graceHours) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateKey || ""));
  if (!match) return null;
  const end = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
    0,
  );
  const hours = Math.max(0, Number(graceHours) || 0);
  end.setHours(end.getHours() + hours);
  return end;
}

/**
 * Remove a face só quando todos os fins de acesso já passaram do prazo extra.
 * Sem nenhum acesso, não há janela válida.
 */
function shouldRevokeAfterGrace(periodEnds, now, graceHours) {
  const ends = (Array.isArray(periodEnds) ? periodEnds : []).filter(Boolean);
  if (!ends.length) return true;
  const instant = now instanceof Date ? now : new Date(now);
  return ends.every((dateKey) => {
    const limit = periodEndPlusGrace(dateKey, graceHours);
    if (!limit) return true;
    return instant.getTime() > limit.getTime();
  });
}

module.exports = {
  periodEndPlusGrace,
  shouldRevokeAfterGrace,
};
