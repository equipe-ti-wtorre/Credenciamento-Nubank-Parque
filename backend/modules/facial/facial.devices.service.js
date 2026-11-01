"use strict";

const db = require("../../config/db");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const { formatUuid } = require("../../utils/publicId");

function mapPublic(row) {
  return {
    id: row.id,
    public_id: formatUuid(row.public_id),
    device_key: row.device_key,
    name: row.name,
    host: row.host,
    port: Number(row.port) || 80,
    username: row.username,
    enabled: !!row.enabled,
    has_password: !!row.password_ciphertext,
    atualizado_em: row.atualizado_em,
  };
}

function mapRuntime(row) {
  return {
    id: row.id,
    device_key: row.device_key,
    name: row.name,
    host: row.host,
    port: Number(row.port) || 80,
    username: row.username,
    password: decrypt(row.password_ciphertext) || "",
    enabled: !!row.enabled,
    last_rec_no: row.last_rec_no == null ? null : Number(row.last_rec_no),
  };
}

async function listPublic() {
  const [rows] = await db.execute(
    `SELECT id, public_id, device_key, name, host, port, username, password_ciphertext, enabled, atualizado_em
     FROM facial_devices
     ORDER BY name ASC, id ASC`,
  );
  return rows.map(mapPublic);
}

async function countEnabled() {
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS total FROM facial_devices WHERE enabled = 1`,
  );
  return Number(row?.total) || 0;
}

async function hasEnabled() {
  return (await countEnabled()) > 0;
}

async function listEnabledRuntime() {
  const [rows] = await db.execute(
    `SELECT id, device_key, name, host, port, username, password_ciphertext, enabled, last_rec_no
     FROM facial_devices
     WHERE enabled = 1
     ORDER BY id ASC`,
  );
  return rows.map(mapRuntime).filter((device) => device.password);
}

async function getById(id) {
  const [rows] = await db.execute(`SELECT * FROM facial_devices WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function createDevice(input) {
  const password = encrypt(input.password);
  const [result] = await db.execute(
    `INSERT INTO facial_devices
       (device_key, name, host, port, username, password_ciphertext, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.device_key,
      input.name,
      input.host,
      input.port,
      input.username,
      password,
      input.enabled ? 1 : 0,
    ],
  );
  const row = await getById(result.insertId);
  return mapPublic(row);
}

async function updateDevice(id, input) {
  const current = await getById(id);
  if (!current) return null;
  const password = input.password ? encrypt(input.password) : current.password_ciphertext;
  await db.execute(
    `UPDATE facial_devices
     SET device_key = ?, name = ?, host = ?, port = ?, username = ?,
         password_ciphertext = ?, enabled = ?
     WHERE id = ?`,
    [
      input.device_key,
      input.name,
      input.host,
      input.port,
      input.username,
      password,
      input.enabled ? 1 : 0,
      id,
    ],
  );
  const row = await getById(id);
  return mapPublic(row);
}

async function deleteDevice(id) {
  const [result] = await db.execute(`DELETE FROM facial_devices WHERE id = ?`, [id]);
  return (result?.affectedRows || 0) > 0;
}

async function setAccessCursor(id, recNo) {
  const next = Math.floor(Number(recNo));
  if (!id || !Number.isFinite(next)) return false;
  const [result] = await db.execute(
    `UPDATE facial_devices
     SET last_rec_no = ?
     WHERE id = ? AND (last_rec_no IS NULL OR last_rec_no < ?)`,
    [next, id, next],
  );
  return (result?.affectedRows || 0) > 0;
}

module.exports = {
  listPublic,
  countEnabled,
  hasEnabled,
  listEnabledRuntime,
  getById,
  createDevice,
  updateDevice,
  deleteDevice,
  setAccessCursor,
  mapRuntime,
};
