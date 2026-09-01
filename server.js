const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "sample-data"));
const version = process.env.APP_VERSION || "dev";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (!entry.name.startsWith(".") && fs.statSync(fullPath).size > 0) return [fullPath];
    return [];
  });
}

function recommend(query, limit = 5) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return listFiles(dataDir)
    .map((filePath) => {
      const filename = path.basename(filePath);
      const text = `${filename} ${fs.readFileSync(filePath, "utf8")}`.toLowerCase();
      const matches = terms.filter((term) => text.includes(term)).length;
      return {
        filename,
        path: path.relative(dataDir, filePath),
        similarity_score: terms.length ? matches / terms.length : 0,
      };
    })
    .filter((file) => file.similarity_score > 0)
    .sort((a, b) => b.similarity_score - a.similarity_score || a.filename.localeCompare(b.filename))
    .slice(0, Math.min(Math.max(Number(limit) || 5, 1), 20));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version, files_indexed: listFiles(dataDir).length });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(`file_recommendation_files_indexed ${listFiles(dataDir).length}\n`);
});

app.get("/api/recommend", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Query parameter q is required" });
  res.json({ query, results: recommend(query, req.query.limit) });
});

if (require.main === module) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`file-recommendation-system ${version} listening on port ${port}`);
  });
}

module.exports = { app, recommend, listFiles };
