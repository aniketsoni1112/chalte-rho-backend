const socketIo = require("socket.io");
const User = require("../models/User");

let io;

// In-memory maps
const userSockets = {};    // { userId: socketId }
const captainSockets = {}; // { captainId: socketId }

exports.initSocket = (server) => {
  io = socketIo(server, { cors: { origin: "*" } });
  global.io = io;

  io.on("connection", (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    // ── REGISTER ──
    // Both users and captains call this on connect
    socket.on("register", ({ userId, role }) => {
      socket.join(`user_${userId}`);
      userSockets[userId] = socket.id;
      if (role === "driver") captainSockets[userId] = socket.id;
      console.log(`✅ Registered [${role}]: ${userId}`);
    });

    // ── CAPTAIN GOES ONLINE ──
    socket.on("captain_online", async ({ captainId, lat, lng, vehicle }) => {
      try {
        await User.findByIdAndUpdate(captainId, {
          isOnline: true,
          vehicle: vehicle || "bike",
          location: { type: "Point", coordinates: [lng, lat] },
        });
        captainSockets[captainId] = socket.id;
        console.log(`🟢 Captain online: ${captainId}`);
      } catch (err) { console.error(err.message); }
    });

    // ── CAPTAIN GOES OFFLINE ──
    socket.on("captain_offline", async ({ captainId }) => {
      try {
        await User.findByIdAndUpdate(captainId, { isOnline: false });
        delete captainSockets[captainId];
        console.log(`🔴 Captain offline: ${captainId}`);
      } catch (err) { console.error(err.message); }
    });

    // ── CAPTAIN GPS PING ──
    socket.on("location_update", async ({ id, lat, lng }) => {
      try {
        await User.findByIdAndUpdate(id, {
          location: { type: "Point", coordinates: [lng, lat] },
        });
        // Broadcast to all users watching the map
        socket.broadcast.emit("driver_location", { id, lat, lng });
      } catch (err) { console.error(err.message); }
    });

    // ── DISCONNECT ──
    socket.on("disconnect", async () => {
      // Find and mark captain offline
      for (const [cid, sid] of Object.entries(captainSockets)) {
        if (sid === socket.id) {
          delete captainSockets[cid];
          await User.findByIdAndUpdate(cid, { isOnline: false }).catch(() => {});
          break;
        }
      }
      for (const [uid, sid] of Object.entries(userSockets)) {
        if (sid === socket.id) { delete userSockets[uid]; break; }
      }
      console.log(`❌ Disconnected: ${socket.id}`);
    });
  });
};

// ── EMIT TO SPECIFIC USER ROOM ──
exports.emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user_${userId}`).emit(event, data);
};

// ── EMIT TO SPECIFIC CAPTAIN ──
exports.emitToCaptain = (captainId, event, data) => {
  if (!io) return;
  io.to(`user_${captainId}`).emit(event, data);
};

// ── FIND NEARBY CAPTAINS (Geospatial) ──
exports.findNearbyCaptains = async (lng, lat, vehicle, radiusKm = 5) => {
  return User.find({
    role: "driver",
    isOnline: true,
    vehicle: vehicle || { $exists: true },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000, // meters
      },
    },
  }).select("_id name vehicleNo vehicle");
};

exports.getUserSockets = () => userSockets;
exports.getCaptainSockets = () => captainSockets;
exports.getIo = () => io;
