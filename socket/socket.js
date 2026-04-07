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
    socket.on("register", ({ userId, role }) => {
      const uid = String(userId);
      // Leave any previous room this socket was in
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(`user_${uid}`);
      userSockets[uid] = socket.id;
      if (role === "driver") captainSockets[uid] = socket.id;
      console.log(`✅ Registered [${role}]: ${uid} → socket ${socket.id}`);
    });

    // ── CAPTAIN GOES ONLINE ──
    socket.on("captain_online", async ({ captainId, lat, lng, vehicle }) => {
      try {
        await User.findByIdAndUpdate(captainId, {
          isOnline: true,
          isAvailable: true,
          vehicle: vehicle || "bike",
          location: { type: "Point", coordinates: [lng, lat] },
        });
        captainSockets[String(captainId)] = socket.id;
        console.log(`🟢 Captain online+available: ${captainId}`);
      } catch (err) { console.error(err.message); }
    });

    // ── CAPTAIN GOES OFFLINE ──
    socket.on("captain_offline", async ({ captainId }) => {
      try {
        await User.findByIdAndUpdate(captainId, { isOnline: false, isAvailable: false });
        delete captainSockets[String(captainId)];
        console.log(`🔴 Captain offline: ${captainId}`);
      } catch (err) { console.error(err.message); }
    });

    // ── CAPTAIN GPS PING ──
    socket.on("location_update", async ({ id, lat, lng }) => {
      try {
        await User.findByIdAndUpdate(id, {
          location: { type: "Point", coordinates: [lng, lat] },
        });
        // Emit only to the user who has an active ride with this captain
        io.emit("driver_location", { id, lat, lng });
      } catch (err) { console.error(err.message); }
    });

    // ── DISCONNECT ──
    socket.on("disconnect", async () => {
      for (const [cid, sid] of Object.entries(captainSockets)) {
        if (sid === socket.id) {
          delete captainSockets[cid];
          await User.findByIdAndUpdate(cid, { isOnline: false, isAvailable: false }).catch(() => {});
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

// ── EMIT TO SPECIFIC USER ROOM + direct socketId fallback ──
exports.emitToUser = (userId, event, data) => {
  if (!io) return;
  const uid = String(userId);
  const room = `user_${uid}`;
  console.log(`📡 emitToUser → ${room} | event: ${event}`);
  io.to(room).emit(event, data);
  // Direct fallback via tracked socketId
  const sid = userSockets[uid];
  if (sid) io.to(sid).emit(event, data);
};

// ── EMIT TO SPECIFIC CAPTAIN ROOM + direct socketId fallback ──
exports.emitToCaptain = (captainId, event, data) => {
  if (!io) return;
  const cid = String(captainId);
  const room = `user_${cid}`;
  console.log(`📡 emitToCaptain → ${room} | event: ${event}`);
  io.to(room).emit(event, data);
  // Direct fallback via tracked socketId
  const sid = captainSockets[cid];
  if (sid) io.to(sid).emit(event, data);
};

// ── FIND NEARBY AVAILABLE CAPTAINS (Geospatial) ──
exports.findNearbyCaptains = async (lng, lat, vehicle, radiusKm = 5) => {
  return User.find({
    role: "driver",
    isOnline: true,
    isAvailable: true, // not on an active ride
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  }).select("_id name vehicleNo vehicle");
};

exports.getUserSockets = () => userSockets;
exports.getCaptainSockets = () => captainSockets;
exports.getIo = () => io;
