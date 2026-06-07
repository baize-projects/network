import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SecretBox } from "./secret-box.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value) {
  return String(value || "").trim();
}

function rowToPanelUser(row, secretBox) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    totpSecret: secretBox.decrypt(row.totp_secret),
    updatedAt: row.updated_at,
    username: row.username,
  };
}

function rowToCloudflareAccount(row, secretBox) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    email: row.email,
    globalApiKey: secretBox.decrypt(row.global_api_key),
    id: row.id,
    name: row.name || row.email,
    source: "sqlite",
    updatedAt: row.updated_at,
  };
}

export class SqliteStore {
  constructor({ databasePath, secretKey = "" }) {
    this.databasePath = databasePath;
    this.secretBox = new SecretBox({
      keyMaterial: secretKey || `sqlite-store:${databasePath}`,
    });
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS panel_user (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        totp_secret TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cloudflare_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        global_api_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  hasPanelUser() {
    const row = this.database.prepare("SELECT 1 AS exists_flag FROM panel_user WHERE id = 1").get();
    return Boolean(row?.exists_flag);
  }

  getPanelUser() {
    const row = this.database.prepare("SELECT * FROM panel_user WHERE id = 1").get();
    return rowToPanelUser(row, this.secretBox);
  }

  createPanelUser({ passwordHash, passwordSalt, totpSecret, username }) {
    const createdAt = nowIso();

    this.database
      .prepare(
        `INSERT INTO panel_user (
          id,
          username,
          password_hash,
          password_salt,
          totp_secret,
          created_at,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalizeString(username),
        passwordHash,
        passwordSalt,
        this.secretBox.encrypt(normalizeString(totpSecret)),
        createdAt,
        createdAt
      );

    return this.getPanelUser();
  }

  hasCloudflareAccounts() {
    const row = this.database
      .prepare("SELECT 1 AS exists_flag FROM cloudflare_accounts LIMIT 1")
      .get();
    return Boolean(row?.exists_flag);
  }

  hasCloudflareAccountEmail(email = "") {
    const normalizedEmail = normalizeString(email).toLowerCase();

    if (!normalizedEmail) {
      return false;
    }

    const row = this.database
      .prepare(
        `SELECT 1 AS exists_flag
         FROM cloudflare_accounts
         WHERE lower(email) = ?
         LIMIT 1`
      )
      .get(normalizedEmail);

    return Boolean(row?.exists_flag);
  }

  listCloudflareAccounts() {
    return this.database
      .prepare(
        `SELECT *
         FROM cloudflare_accounts
         ORDER BY rowid ASC`
      )
      .all()
      .map((row) => rowToCloudflareAccount(row, this.secretBox));
  }

  getCloudflareAccount(accountId = "") {
    const normalizedId = normalizeString(accountId);

    if (normalizedId) {
      return rowToCloudflareAccount(
        this.database.prepare("SELECT * FROM cloudflare_accounts WHERE id = ?").get(normalizedId),
        this.secretBox
      );
    }

    return rowToCloudflareAccount(
      this.database
        .prepare(
          `SELECT *
           FROM cloudflare_accounts
           ORDER BY rowid ASC
          LIMIT 1`
        )
        .get(),
      this.secretBox
    );
  }

  createCloudflareAccount({ email, globalApiKey, name = "" }) {
    const createdAt = nowIso();
    const normalizedEmail = normalizeString(email).toLowerCase();
    const normalizedName = normalizeString(name) || normalizedEmail;
    const id = `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    this.database
      .prepare(
        `INSERT INTO cloudflare_accounts (
          id,
          name,
          email,
          global_api_key,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        normalizedName,
        normalizedEmail,
        this.secretBox.encrypt(normalizeString(globalApiKey)),
        createdAt,
        createdAt
      );

    return this.getCloudflareAccount(id);
  }

  createCloudflareAccounts(accounts = []) {
    const created = [];

    for (const account of accounts) {
      created.push(this.createCloudflareAccount(account));
    }

    return created;
  }

  runSetupTransaction(callback) {
    this.database.exec("BEGIN IMMEDIATE");

    try {
      const result = callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}
