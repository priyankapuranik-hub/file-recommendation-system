const express = require("express");
const fs = require("fs");
const path = require("path");
const { recordOpenedFile, getOpenedFiles, authenticate, createSession, getSession, deleteSession } = require("./database");

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "sample-data"));
const version = process.env.APP_VERSION || "dev";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getToken(req) {
  const value = req.headers.cookie?.match(/(?:^|;\s*)session=([^;]+)/);
  return value ? decodeURIComponent(value[1]) : null;
}

async function requireUser(req, res, next) {
  try {
    req.user = getToken(req) ? await getSession(getToken(req)) : null;
    if (!req.user) return res.status(401).json({ error: "Login required" });
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  next();
}

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/api/login", async (req, res, next) => {
  try {
    const user = await authenticate(String(req.body.username || ""), String(req.body.password || ""));
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    const token = await createSession(user.id);
    res.set("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
    res.json({ user: { username: user.username, role: user.role } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", async (req, res, next) => {
  try {
    const token = getToken(req);
    if (token) await deleteSession(token);
    res.set("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireUser, (req, res) => res.json({ user: { username: req.user.username, role: req.user.role } }));

app.get("/history", requireUser, requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "history.html"));
});

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (!entry.name.startsWith(".") && fs.statSync(fullPath).size > 0) return [fullPath];
    return [];
  });
}

function resolveDataFile(relativePath) {
  const resolvedPath = path.resolve(dataDir, relativePath);
  const dataRoot = `${dataDir}${path.sep}`;
  if (resolvedPath !== dataDir && !resolvedPath.startsWith(dataRoot)) return null;
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) return null;
  return resolvedPath;
}

function recommend(query, limit = 5) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return listFiles(dataDir)
    .map((filePath) => {
      const filename = path.basename(filePath);
      const rawContent = fs.readFileSync(filePath, "utf8");
      const text = `${filename} ${rawContent}`.toLowerCase();
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

app.get("/api/file", requireUser, (req, res) => {
  const relativePath = String(req.query.path || "");
  const searchQuery = String(req.query.q || "");
  const filePath = resolveDataFile(relativePath);
  if (!filePath) return res.status(404).json({ error: "File not found" });
  res.type(path.extname(filePath)).set("Content-Disposition", "inline").sendFile(filePath, (error) => {
    if (error) return res.status(error.statusCode || 500).end();
    recordOpenedFile(relativePath, searchQuery, req.user.username).catch((databaseError) => {
      console.error("Failed to record opened file:", databaseError);
    });
  });
});

app.get("/api/history", requireUser, requireAdmin, async (req, res, next) => {
  try {
    res.json({ files: await getOpenedFiles(req.query.limit) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recommend", requireUser, (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Query parameter q is required" });
  res.json({ query, results: recommend(query, req.query.limit) });
});

if (require.main === module) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`file-recommendation-system ${version} listening on port ${port}`);
  });
}

module.exports = { app, recommend, listFiles, resolveDataFile };
