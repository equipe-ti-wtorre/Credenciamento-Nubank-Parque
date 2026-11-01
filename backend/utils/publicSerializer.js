const db = require("../config/db");
const {
  FIELD_BY_KEY,
  TIPO_ENTIDADE,
  PARENT_HINT,
  formatUuid,
  isUuid,
  isSafeIdent,
} = require("./publicId");

const cache = new Map();

function cacheKey(table, id) {
  return `${table}:${id}`;
}

function isPlainObject(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Date)
  );
}

function numericId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

/**
 * Identidade da linha quando a PK é o campo genérico `id`
 * (usuarios, perfis, setores, vínculos). FK no mesmo objeto não conta.
 */
function genericRowIdentity(node, parentKey) {
  if (!node || node.id == null || isUuid(node.public_id)) return null;
  const hinted = PARENT_HINT[parentKey] || inferGenericTable(node);
  if (!hinted || hinted.pk !== "id") return null;
  const id = numericId(node.id);
  if (id == null) return null;
  return { table: hinted.table, pk: hinted.pk, id };
}

function inferGenericTable(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.tipoEntidade || obj.tipo_entidade) return { table: "aprovacoes", pk: "id" };
  if (obj.azure_tenant_id != null || obj.eh_principal != null) return { table: "azure_tenants", pk: "id" };
  if (obj.username && obj.email) return { table: "usuarios", pk: "id" };
  if (obj.codigo && (obj.is_super_admin != null || obj.permissions || obj.permissoes)) {
    return { table: "perfis", pk: "id" };
  }
  if (obj.nivel_aprovacao != null && obj.id_usuario != null && obj.id_setor != null) {
    return { table: "setor_usuarios", pk: "id" };
  }
  if (Object.prototype.hasOwnProperty.call(obj, "ramal") && obj.id_setor != null) {
    return { table: "setor_contatos", pk: "id" };
  }
  if (obj.decisao && (obj.id_aprovacao != null || obj.idAprovacao != null)) {
    return { table: "aprovacao_decisoes", pk: "id" };
  }
  if (obj.titulo && Object.prototype.hasOwnProperty.call(obj, "link")) return { table: "alertas", pk: "id" };
  if (obj.webhook_url || obj.destinatario_email) return { table: "teams_integrations", pk: "id" };
  if (obj.block_type || obj.blocked_until) return { table: "collaborator_block_list", pk: "id_collaborator" };
  return null;
}

function collect(node, parentKey, bag) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, parentKey, bag);
    return;
  }
  if (!isPlainObject(node)) return;

  const tipo = node.tipoEntidade || node.tipo_entidade;
  const entidadeId = numericId(node.idEntidade != null ? node.idEntidade : node.id_entidade);
  if (tipo && TIPO_ENTIDADE[tipo] && entidadeId != null) {
    const spec = TIPO_ENTIDADE[tipo];
    addNeed(bag, spec.table, spec.pk, entidadeId);
  }

  const identity = genericRowIdentity(node, parentKey);
  if (identity) addNeed(bag, identity.table, identity.pk, identity.id);

  let own = null;
  for (const spec of FIELD_BY_KEY.values()) {
    if (spec.ownRank >= 200) continue;
    if (node[spec.key] == null) continue;
    if (!own || spec.ownRank < own.ownRank) own = spec;
  }

  if (own && own.table) {
    const id = numericId(node[own.key]);
    if (id != null) addNeed(bag, own.table, own.pk, id);
  } else if (!identity && node.id != null && !isUuid(node.public_id)) {
    const hinted = PARENT_HINT[parentKey] || inferGenericTable(node);
    const id = numericId(node.id);
    if (hinted && id != null) addNeed(bag, hinted.table, hinted.pk, id);
  }

  for (const spec of FIELD_BY_KEY.values()) {
    if (!spec.table || spec.ownRank >= 200) continue;
    if (own && spec.key === own.key) continue;
    const id = numericId(node[spec.key]);
    if (id != null) addNeed(bag, spec.table, spec.pk, id);
  }

  for (const [key, value] of Object.entries(node)) {
    if (isPlainObject(value) || Array.isArray(value)) collect(value, key, bag);
  }
}

function addNeed(bag, table, pk, id) {
  if (!isSafeIdent(table) || !isSafeIdent(pk)) return;
  const key = cacheKey(table, id);
  if (cache.has(key)) return;
  if (!bag.has(table)) bag.set(table, { pk, ids: new Set() });
  bag.get(table).ids.add(id);
}

async function hydrate(bag) {
  for (const [table, group] of bag) {
    const ids = [...group.ids];
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT \`${group.pk}\` AS pk, CAST(public_id AS CHAR) AS public_id
         FROM \`${table}\` WHERE \`${group.pk}\` IN (${placeholders})`,
      ids,
    );
    const found = new Set();
    for (const row of rows) {
      cache.set(cacheKey(table, row.pk), formatUuid(row.public_id));
      found.add(Number(row.pk));
    }
    for (const id of ids) {
      if (!found.has(Number(id))) cache.set(cacheKey(table, id), null);
    }
  }
}

function lookup(table, id) {
  return cache.get(cacheKey(table, id)) || null;
}

function rewrite(node, parentKey) {
  if (Array.isArray(node)) return node.map((item) => rewrite(item, parentKey));
  if (!isPlainObject(node)) return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (isPlainObject(value) || Array.isArray(value)) out[key] = rewrite(value, key);
    else if (key === "public_id") out.public_id = formatUuid(value);
    else out[key] = value;
  }

  const tipo = out.tipoEntidade || out.tipo_entidade;
  const entidadeKey = out.idEntidade != null ? "idEntidade" : out.id_entidade != null ? "id_entidade" : null;
  if (tipo && entidadeKey && TIPO_ENTIDADE[tipo]) {
    const spec = TIPO_ENTIDADE[tipo];
    const id = numericId(out[entidadeKey]);
    const pub = id == null ? null : lookup(spec.table, id);
    if (pub) out.entidade_public_id = pub;
    delete out[entidadeKey];
  }

  const identity = genericRowIdentity(out, parentKey);

  let own = null;
  for (const spec of FIELD_BY_KEY.values()) {
    if (spec.ownRank >= 200) continue;
    if (out[spec.key] == null) continue;
    if (!own || spec.ownRank < own.ownRank) own = spec;
  }

  const hadPublic = isUuid(out.public_id);
  if (identity && !hadPublic) {
    const pub = lookup(identity.table, identity.id);
    if (pub) out.public_id = pub;
    delete out.id;
  }

  if (own && own.table) {
    const id = numericId(out[own.key]);
    const pub = id == null ? null : lookup(own.table, id);
    if (!identity && !hadPublic && pub) out.public_id = pub;
    else if ((identity || hadPublic) && pub && own.out) out[own.out] = pub;
    delete out[own.key];
  } else if (!identity && out.id != null && !isUuid(out.public_id)) {
    const hinted = PARENT_HINT[parentKey] || inferGenericTable(out);
    const id = numericId(out.id);
    if (hinted && id != null) {
      const pub = lookup(hinted.table, id);
      if (pub) out.public_id = pub;
    }
    delete out.id;
  } else if (out.id != null && isUuid(out.public_id)) {
    delete out.id;
  }

  for (const spec of FIELD_BY_KEY.values()) {
    if (!spec.table || spec.ownRank >= 200) continue;
    if (own && spec.key === own.key) continue;
    if (out[spec.key] == null) continue;
    const id = numericId(out[spec.key]);
    if (id != null) {
      const pub = lookup(spec.table, id);
      if (pub) out[spec.out] = pub;
    }
    delete out[spec.key];
  }

  if (out.id != null && !isUuid(String(out.id))) delete out.id;
  return out;
}

async function serializePublic(payload) {
  if (payload == null) return payload;
  const bag = new Map();
  collect(payload, null, bag);
  if (bag.size) await hydrate(bag);
  return rewrite(payload, null);
}

module.exports = { serializePublic };
