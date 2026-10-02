const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { getCatalogEntry } = require("./email-template.catalog");
const { renderFields } = require("./email-template.renderer");
const { EMAIL_TEMPLATE_SEEDS } = require("./email-template.seeds");

let seedPromise = null;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao,
    assunto: row.assunto,
    corpo_html: row.corpo_html,
    corpo_texto: row.corpo_texto,
    ativo: Boolean(row.ativo),
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

async function ensureSeeds() {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const seed of EMAIL_TEMPLATE_SEEDS) {
        await db.execute(
          `INSERT INTO email_templates
             (codigo, nome, descricao, assunto, corpo_html, corpo_texto, ativo)
           VALUES (?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             nome = IF(updated_by IS NULL, ?, nome),
             descricao = IF(updated_by IS NULL, ?, descricao),
             assunto = IF(updated_by IS NULL, ?, assunto),
             corpo_html = IF(updated_by IS NULL, ?, corpo_html),
             corpo_texto = IF(updated_by IS NULL, ?, corpo_texto)`,
          [
            seed.codigo,
            seed.nome,
            seed.descricao,
            seed.assunto,
            seed.corpo_html,
            seed.corpo_texto,
            seed.nome,
            seed.descricao,
            seed.assunto,
            seed.corpo_html,
            seed.corpo_texto,
          ],
        );
      }
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function list() {
  await ensureSeeds();
  const [rows] = await db.execute(
    `SELECT id, codigo, nome, descricao, assunto, ativo, updated_at, updated_by
       FROM email_templates
      ORDER BY nome ASC`,
  );
  return rows.map(mapRow);
}

async function getByCodigo(codigo) {
  await ensureSeeds();
  const [rows] = await db.execute(
    `SELECT id, codigo, nome, descricao, assunto, corpo_html, corpo_texto,
            ativo, updated_at, updated_by
       FROM email_templates
      WHERE codigo = ?
      LIMIT 1`,
    [codigo],
  );
  const row = mapRow(rows[0]);
  if (!row) return null;

  const catalog = getCatalogEntry(codigo);
  return {
    ...row,
    variables: catalog?.variables || [],
    sample_vars: catalog?.sampleVars || {},
  };
}

async function updateByCodigo(codigo, data, updatedBy = null) {
  const existing = await getByCodigo(codigo);
  if (!existing) throw new AppError("Template de e-mail não encontrado.", 404);

  await db.execute(
    `UPDATE email_templates
        SET nome = ?,
            descricao = ?,
            assunto = ?,
            corpo_html = ?,
            corpo_texto = ?,
            ativo = ?,
            updated_by = ?
      WHERE codigo = ?`,
    [
      data.nome,
      data.descricao ?? null,
      data.assunto,
      data.corpo_html,
      data.corpo_texto ?? null,
      data.ativo ? 1 : 0,
      updatedBy,
      codigo,
    ],
  );

  return getByCodigo(codigo);
}

/**
 * Carrega template ativo e renderiza. Retorna null se inexistente/inativo.
 */
async function renderActive(codigo, vars = {}) {
  await ensureSeeds();
  const [rows] = await db.execute(
    `SELECT assunto, corpo_html, corpo_texto, ativo
       FROM email_templates
      WHERE codigo = ?
      LIMIT 1`,
    [codigo],
  );
  const row = rows[0];
  if (!row || !row.ativo) return null;
  return renderFields(row, vars);
}

function renderDraft(templateLike, vars = {}) {
  return renderFields(
    {
      assunto: templateLike.assunto,
      corpo_html: templateLike.corpo_html,
      corpo_texto: templateLike.corpo_texto,
    },
    vars,
  );
}

module.exports = {
  list,
  getByCodigo,
  updateByCodigo,
  renderActive,
  renderDraft,
};
