import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("sitetrack.db");
const JWT_SECRET = "sitetrack-secret-key-123";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT
  );

  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    homeSite TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    currentUser TEXT,
    currentUserId INTEGER,
    currentLocation TEXT,
    checkedOutAt TEXT,
    purpose TEXT,
    FOREIGN KEY(currentUserId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS checkout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assetId INTEGER,
    assetCode TEXT,
    userId INTEGER,
    userName TEXT,
    action TEXT,
    location TEXT,
    timestamp TEXT,
    purpose TEXT
  );
`);

// Seed Data if empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync("123456", salt);
  const workerPass = bcrypt.hashSync("123456", salt);

  db.prepare("INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)").run(
    "Admin User", "admin@site.com", adminPass, "admin", "Management"
  );
  db.prepare("INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)").run(
    "Worker User", "worker@site.com", workerPass, "worker", "Operations"
  );

  const sites = ["Site A (Main Yard)", "Site B (North Block)", "Site C (South Wing)", "Site D (Workshop)"];
  sites.forEach(s => db.prepare("INSERT INTO sites (name) VALUES (?)").run(s));

  const assets = [
    ["DRL-001", "Hydraulic Drilling Machine", "Heavy Equipment", "Site A (Main Yard)", "available"],
    ["GEN-003", "Diesel Generator 50kVA", "Power", "Site B (North Block)", "in-use"],
    ["WLD-002", "Arc Welding Set", "Tools", "Site A (Main Yard)", "available"],
    ["EXC-004", "Mini Excavator", "Heavy Equipment", "Site C (South Wing)", "in-use"],
    ["CMP-001", "Air Compressor 100L", "Tools", "Site D (Workshop)", "available"]
  ];

  assets.forEach(a => {
    db.prepare("INSERT INTO assets (code, name, category, homeSite, status) VALUES (?, ?, ?, ?, ?)").run(...a);
  });
  
  // Update some assets to be in-use for Ravi/Priya as per sample data
  // Since we don't have Ravi/Priya in users yet, we'll just set the status and text
  db.prepare("UPDATE assets SET status = 'in-use', currentUser = 'Ravi Kumar', currentLocation = 'Site B Block 3' WHERE code = 'GEN-003'").run();
  db.prepare("UPDATE assets SET status = 'in-use', currentUser = 'Priya Sharma', currentLocation = 'Site C' WHERE code = 'EXC-004'").run();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // API Routes
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.get("/api/assets", (req, res) => {
    const assets = db.prepare("SELECT * FROM assets").all();
    res.json(assets);
  });

  app.get("/api/assets/search", (req, res) => {
    const q = `%${req.query.q}%`;
    const assets = db.prepare("SELECT * FROM assets WHERE code LIKE ? OR name LIKE ?").all(q, q);
    res.json(assets);
  });

  app.post("/api/assets/checkout", authenticate, (req: any, res) => {
    const { assetId, location, purpose } = req.body;
    const timestamp = new Date().toISOString();
    
    const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as any;
    if (!asset || asset.status !== 'available') {
      return res.status(400).json({ error: "Asset not available" });
    }

    db.prepare(`
      UPDATE assets SET 
        status = 'in-use', 
        currentUser = ?, 
        currentUserId = ?, 
        currentLocation = ?, 
        checkedOutAt = ?, 
        purpose = ? 
      WHERE id = ?
    `).run(req.user.name, req.user.id, location, timestamp, purpose, assetId);

    db.prepare(`
      INSERT INTO checkout_logs (assetId, assetCode, userId, userName, action, location, timestamp, purpose)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assetId, asset.code, req.user.id, req.user.name, 'checkout', location, timestamp, purpose);

    res.json({ success: true });
  });

  app.post("/api/assets/checkin", authenticate, (req: any, res) => {
    const { assetId } = req.body;
    const timestamp = new Date().toISOString();
    
    const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as any;
    if (!asset || asset.status !== 'in-use') {
      return res.status(400).json({ error: "Asset not in use" });
    }

    db.prepare(`
      UPDATE assets SET 
        status = 'available', 
        currentUser = NULL, 
        currentUserId = NULL, 
        currentLocation = homeSite, 
        checkedOutAt = NULL, 
        purpose = NULL 
      WHERE id = ?
    `).run(assetId);

    db.prepare(`
      INSERT INTO checkout_logs (assetId, assetCode, userId, userName, action, location, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(assetId, asset.code, req.user.id, req.user.name, 'checkin', asset.homeSite, timestamp);

    res.json({ success: true });
  });

  app.get("/api/sites", (req, res) => {
    const sites = db.prepare("SELECT * FROM sites").all();
    res.json(sites);
  });

  app.get("/api/history", authenticate, (req, res) => {
    const logs = db.prepare("SELECT * FROM checkout_logs ORDER BY timestamp DESC").all();
    res.json(logs);
  });

  // Admin Routes
  app.post("/api/admin/assets", authenticate, (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { code, name, category, homeSite } = req.body;
    db.prepare("INSERT INTO assets (code, name, category, homeSite) VALUES (?, ?, ?, ?)").run(code, name, category, homeSite);
    res.json({ success: true });
  });

  app.delete("/api/admin/assets/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    db.prepare("DELETE FROM assets WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:3000");
  });
}

startServer();
