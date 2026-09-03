const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();

const storageDir = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "storage"));
fs.mkdirSync(storageDir, { recursive: true });

const db = new sqlite3.Database(path.join(storageDir, "file-recommendation.db"));
const ready = new Promise((resolve, reject) => {
  db.run(
    `CREATE TABLE IF NOT EXISTS opened_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      search_query TEXT NOT NULL DEFAULT '',
      opened_at TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT 'unknown'
    )`,
    (error) => {
      if (error) return reject(error);
      db.all("PRAGMA table_info(opened_files)", (columnError, columns) => {
        if (columnError) return reject(columnError);
        if (columns.some((column) => column.name === "username")) return createAuthTables(resolve, reject);
        db.run("ALTER TABLE opened_files ADD COLUMN username TEXT NOT NULL DEFAULT 'unknown'", (migrationError) => {
          if (migrationError) reject(migrationError);
          else createAuthTables(resolve, reject);
        });
      });
    }
  );
});

function createAuthTables(resolve, reject) {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'admin'))
    )`,
    (error) => {
      if (error) return reject(error);
      db.run(
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          expires_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        (sessionError) => {
          if (sessionError) reject(sessionError);
          else seedUsers(resolve, reject);
        }
      );
    }
  );
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

function seedUsers(resolve, reject) {
  const users = [
    [process.env.ADMIN_USERNAME || "admin", process.env.ADMIN_PASSWORD || "admin123", "admin"],
    [process.env.USER_USERNAME || "user", process.env.USER_PASSWORD || "user123", "user"],
  ];
  let remaining = users.length;
  users.forEach(([username, password, role]) => {
    db.run(
      "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, hashPassword(password), role],
      (error) => {
        if (error) return reject(error);
        remaining -= 1;
        if (!remaining) resolve();
      }
    );
  });
}

function recordOpenedFile(filePath, searchQuery, username = "unknown") {
  return ready.then(() => new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO opened_files (filename, file_path, search_query, opened_at, username) VALUES (?, ?, ?, ?, ?)",
      [path.basename(filePath), filePath, searchQuery, new Date().toISOString(), username],
      function onInsert(error) {
        if (error) reject(error);
        else resolve(this.lastID);
      }
    );
  }));
}

function getOpenedFiles(limit = 50) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.all(
      "SELECT id, filename, file_path, search_query, opened_at, username FROM opened_files ORDER BY id DESC LIMIT ?",
      [Math.min(Math.max(Number(limit) || 50, 1), 100)],
      (error, rows) => (error ? reject(error) : resolve(rows))
    );
  }));
}

function authenticate(username, password) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.get("SELECT id, username, password_hash, role FROM users WHERE username = ?", [username], (error, user) => {
      if (error) return reject(error);
      if (!user || !verifyPassword(password, user.password_hash)) return resolve(null);
      resolve({ id: user.id, username: user.username, role: user.role });
    });
  }));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  return ready.then(() => new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      [crypto.createHash("sha256").update(token).digest("hex"), userId, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()],
      (error) => (error ? reject(error) : resolve(token))
    );
  }));
}

function getSession(token) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.get(
      `SELECT users.id, users.username, users.role
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      [crypto.createHash("sha256").update(token).digest("hex"), new Date().toISOString()],
      (error, user) => (error ? reject(error) : resolve(user || null))
    );
  }));
}

function deleteSession(token) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.run("DELETE FROM sessions WHERE token_hash = ?", [crypto.createHash("sha256").update(token).digest("hex")], (error) => (
      error ? reject(error) : resolve()
    ));
  }));
}

module.exports = { recordOpenedFile, getOpenedFiles, authenticate, createSession, getSession, deleteSession };
