import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import User from "./src/models/user.model.js";
import Company from "./src/models/client/client.model.js";

import authRoutes from "./src/routes/auth.route.js";
import companyRoutes from "./src/routes/company.route.js";
import { connectDB } from "./src/config/db.js";

const app = express();
const PORT = process.env.PORT;

const server = http.createServer(app);

// Configure allowed origins for CORS
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log("❌ Socket rejected: No token");
      return next(new Error("No token"));
    }

    console.log("🔑 [AUTH] Verifying token...");

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // ✅ DEBUG: Log the decoded token
    console.log("🔍 [AUTH] Decoded token:", JSON.stringify(decoded, null, 2));

    const userId = decoded.userId || decoded._id;

    if (!userId) {
      console.log("❌ [AUTH] Socket rejected: No user ID in token");
      return next(new Error("Invalid token payload"));
    }

    console.log("🔍 [AUTH] Looking up user with ID:", userId);

    const user = await User.findById(userId);

    if (!user) {
      console.log("❌ [AUTH] Socket rejected: User not found for ID:", userId);
      return next(new Error("User not found"));
    }

    // ✅ CRITICAL DEBUG: Log the user details
    console.log("✅ [AUTH] User found:");
    console.log("   - ID:", user._id);
    console.log("   - Email:", user.email);
    console.log("   - Role:", user.role);
    console.log("   - Role type:", typeof user.role);

    socket.user = user;

    console.log(
      "✅ [AUTH] Socket authenticated:",
      user.email,
      "Role:",
      user.role
    );
    next();
  } catch (err) {
    console.error("❌ [AUTH] Socket auth error:", err.message);
    next(new Error("Unauthorized: " + err.message));
  }
});

io.on("connection", async (socket) => {
  console.log("═══════════════════════════════════════");
  console.log(`✅ [CONNECTION] New client connected`);
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   User: ${socket.user.email}`);
  console.log(`   User ID: ${socket.user._id}`);
  console.log(`   Role: ${socket.user.role}`);
  console.log(`   Role Type: ${typeof socket.user.role}`);
  console.log("═══════════════════════════════════════");

  // Join user's personal room
  socket.join(socket.user._id.toString());
  console.log(`📍 [ROOM] User joined personal room: ${socket.user._id}`);

  // ✅ FIXED: Check role with multiple conditions
  const userRole = socket.user.role?.toString().toLowerCase().trim();

  console.log(`🔍 [ROLE CHECK] Checking if user is admin...`);
  console.log(`   Original role: "${socket.user.role}"`);
  console.log(`   Normalized role: "${userRole}"`);
  console.log(`   Is admin? ${userRole === "admin"}`);

  if (userRole === "admin") {
    console.log(`👑 [ADMIN] User IS an admin, joining 'admins' room...`);

    socket.join("admins");

    // ✅ VERIFY the join happened
    const rooms = Array.from(socket.rooms);
    console.log(`📊 [ADMIN] Socket rooms after join:`, rooms);

    if (rooms.includes("admins")) {
      console.log(
        `✅✅✅ [ADMIN SUCCESS] ${socket.user.email} successfully joined 'admins' room!`
      );
    } else {
      console.error(
        `❌❌❌ [ADMIN FAILED] ${socket.user.email} FAILED to join 'admins' room!`
      );
    }
  } else {
    console.log(`ℹ️ [NON-ADMIN] User is not an admin (role: ${userRole})`);
  }

  // Handle client company rooms
  if (userRole === "client") {
    console.log(`🏢 [CLIENT] User is a client, looking up company...`);
    const company = await Company.findOne({ user: socket.user._id });
    if (company) {
      socket.company = company;
      const companyRoom = company._id.toString();
      socket.join(companyRoom);
      console.log(`✅ [CLIENT] Joined company room: ${companyRoom}`);
    } else {
      console.log(`⚠️ [CLIENT] No company found for client user`);
    }
  }

  // ✅ Log all connected admins
  const logAdminStatus = async () => {
    console.log("📊 ════════ ADMIN STATUS ════════");
    const allSockets = await io.fetchSockets();
    console.log(`   Total connected sockets: ${allSockets.length}`);

    const adminSockets = allSockets.filter((s) => {
      const rooms = Array.from(s.rooms);
      return rooms.includes("admins");
    });

    console.log(`   Admins in 'admins' room: ${adminSockets.length}`);

    if (adminSockets.length > 0) {
      console.log(`   Admin details:`);
      adminSockets.forEach((s, i) => {
        console.log(`      ${i + 1}. ${s.user?.email} (${s.id})`);
      });
    } else {
      console.log(`   ⚠️ NO ADMINS CONNECTED`);
    }
    console.log("═════════════════════════════════");
  };

  await logAdminStatus();

  socket.on("disconnect", async () => {
    console.log(
      `❌ [DISCONNECT] Client disconnected: ${socket.id} (${socket.user.email})`
    );
    await logAdminStatus();
  });

  // ✅ Manual room join handler
  socket.on("request-admin-room", () => {
    console.log(
      `📨 [MANUAL JOIN] Received manual admin room join request from ${socket.user.email}`
    );

    const userRole = socket.user.role?.toString().toLowerCase().trim();

    if (userRole === "admin") {
      socket.join("admins");
      console.log(
        `👑 [MANUAL JOIN] Admin ${socket.user.email} manually joined 'admins' room`
      );

      const rooms = Array.from(socket.rooms);
      console.log(`   Rooms after manual join:`, rooms);

      socket.emit("admin-room-joined", {
        success: true,
        rooms: rooms,
      });
    } else {
      console.log(`❌ [MANUAL JOIN] User is not admin (role: ${userRole})`);
      socket.emit("admin-room-joined", {
        success: false,
        reason: "Not an admin",
        role: userRole,
      });
    }
  });
});

app.set("io", io);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);

app.get("/", (req, res) => {
  res.send("Legacy Global");
});

server.listen(PORT, () => {
  connectDB();
  console.log("Server is running at http://localhost:" + PORT);
  console.log(`Socket.IO is ready`);
});

export { io };
