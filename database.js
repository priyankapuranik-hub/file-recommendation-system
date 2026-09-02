const fs = require("fs");
const path = require("path");
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
      opened_at TEXT NOT NULL
    )`,
    (error) => (error ? reject(error) : resolve())
  );
});

function recordOpenedFile(filePath, searchQuery) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO opened_files (filename, file_path, search_query, opened_at) VALUES (?, ?, ?, ?)",
      [path.basename(filePath), filePath, searchQuery, new Date().toISOString()],
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
      "SELECT id, filename, file_path, search_query, opened_at FROM opened_files ORDER BY id DESC LIMIT ?",
      [Math.min(Math.max(Number(limit) || 50, 1), 100)],
      (error, rows) => (error ? reject(error) : resolve(rows))
    );
  }));
}

module.exports = { recordOpenedFile, getOpenedFiles };
