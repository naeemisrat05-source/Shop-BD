import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "ShopBD E-commerce" });
  });

  // Server-side Admin Authorization Verification endpoint
  // Strictly enforces that only the configured administrator UID/email is allowed
  app.post("/api/admin/verify-auth", (req, res) => {
    const { uid, email } = req.body || {};
    const configuredAdminUid = process.env.VITE_ADMIN_UID || "fO27HKUtQofzCq4TLNhfNu6quw03";
    const configuredAdminEmail = (process.env.VITE_ADMIN_EMAIL || "naeemmusic2.0@gmail.com").toLowerCase();
    const authorizedAdminEmails = [
      configuredAdminEmail,
      "naeemmusic2.0@gmail.com",
      "naeemisrat05@gmail.com",
      "admin@shopbd.com"
    ].map(e => e.toLowerCase());

    const isUidMatch = uid && uid === configuredAdminUid;
    const isEmailMatch = email && typeof email === "string" && authorizedAdminEmails.includes(email.trim().toLowerCase());

    if (!isUidMatch && !isEmailMatch) {
      return res.status(403).json({
        authorized: false,
        error: "Access Denied: You do not possess administrator permissions for ShopBD."
      });
    }

    return res.json({
      authorized: true,
      role: "admin",
      adminUid: configuredAdminUid,
      adminEmail: configuredAdminEmail,
      timestamp: new Date().toISOString()
    });
  });

  // Server-side protected admin status
  app.get("/api/admin/system-status", (req, res) => {
    const authHeader = req.headers["x-admin-uid"];
    const configuredAdminUid = process.env.VITE_ADMIN_UID || "fO27HKUtQofzCq4TLNhfNu6quw03";
    if (authHeader !== configuredAdminUid) {
      return res.status(403).json({ authorized: false, error: "Unauthorized access" });
    }
    return res.json({
      status: "operational",
      store: "ShopBD",
      database: "Firebase Firestore",
      nodeEnv: process.env.NODE_ENV || "development"
    });
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ShopBD] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
