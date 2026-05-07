const socketIo = require("socket.io");
const User = require("../models/User");

let io;

const userSockets    = {}; // { userId: socketId }
const captainSockets = {}; // { captainId: socketId }

exports.initSocket = (server) => {
  io = socketIo(server, { cors: { origin: "*" } });
  global.io = io;

  io.on("connection", (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    // ── REGISTER ──
    socket.on("register", ({ userId, role }) => {
      if (!userId) return;
      const uid = String(userId);
      socket.join(`user_${uid}`);
      userSockets[uid] = socket.id;
      if (role === "driver") {
        captainSockets[uid] = socket.id;
        console.log(`✅ Driver registered: ${uid} → ${socket.id}`);
      } else {
        console.log(`✅ User registered: ${uid} → ${socket.id}`);
      }
    });

    // ── CAPTAIN GOES ONLINE ──
    socket.on("captain_online", async ({ captainId, lat, lng, vehicle }) => {
      try {
        const cid = String(captainId);
        await User.findByIdAndUpdate(cid, {
          isOnline: true,
          isAvailable: true,
          vehicle: vehicle || "bike",
          location: { type: "Point", coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0] },
        });
        captainSockets[cid] = socket.id;
        socket.join(`user_${cid}`);
        console.log(`🟢 Captain online: ${cid} | socket: ${socket.id}`);
      } catch (err) { console.error("captain_online error:", err.message); }
    });

    // ── CAPTAIN GOES OFFLINE ──
    socket.on("captain_offline", async ({ captainId }) => {
      try {
        const cid = String(captainId);
        await User.findByIdAndUpdate(cid, { isOnline: false, isAvailable: false });
        delete captainSockets[cid];
        console.log(`🔴 Captain offline: ${cid}`);
      } catch (err) { console.error("captain_offline error:", err.message); }
    });

    // ── CAPTAIN GPS PING ──
    socket.on("location_update", async ({ id, lat, lng }) => {
      try {
        await User.findByIdAndUpdate(id, {
          location: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
        });
        io.emit("driver_location", { id, lat, lng });
      } catch (err) { console.error("location_update error:", err.message); }
    });

    // ── DISCONNECT ──
    socket.on("disconnect", async () => {
      for (const [cid, sid] of Object.entries(captainSockets)) {
        if (sid === socket.id) {
          delete captainSockets[cid];
          await User.findByIdAndUpdate(cid, { isOnline: false, isAvailable: false }).catch(() => {});
          console.log(`🔴 Captain disconnected: ${cid}`);
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

// ── EMIT TO USER ──
exports.emitToUser = (userId, event, data) => {
  if (!io) return;
  const uid = String(userId);
  console.log(`📡 emitToUser [${event}] → ${uid} | socket:${userSockets[uid] || "NONE"}`);
  io.to(`user_${uid}`).emit(event, data);
  const sid = userSockets[uid];
  if (sid) io.to(sid).emit(event, data);
};

// ── EMIT TO CAPTAIN ──
exports.emitToCaptain = (captainId, event, data) => {
  if (!io) return;
  const cid = String(captainId);
  console.log(`📡 emitToCaptain [${event}] → ${cid} | socket:${captainSockets[cid] || "NONE"}`);
  io.to(`user_${cid}`).emit(event, data);
  const sid = captainSockets[cid];
  if (sid) io.to(sid).emit(event, data);
};

// ── SEND new_ride TO ALL ONLINE DRIVERS ──
// Priority: tracked sockets → room broadcast → global fallback
exports.sendRideToDrivers = (ridePayload, excludeUserId) => {
  if (!io) return;
  const exclude = String(excludeUserId);
  const tracked = Object.entries(captainSockets).filter(([cid]) => cid !== exclude);

  console.log(`📡 sendRideToDrivers | tracked: ${tracked.length} | excludeUser: ${exclude}`);

  if (tracked.length > 0) {
    // Send to every tracked captain via both socketId and room
    tracked.forEach(([cid, sid]) => {
      io.to(sid).emit("new_ride", ridePayload);
      io.to(`user_${cid}`).emit("new_ride", ridePayload);
    });
  }

  // ALWAYS also broadcast globally so captains connected but not in map receive it
  // (handles server restart scenario where captainSockets map is empty)
  io.emit("new_ride", ridePayload);
};

// ── FIND NEARBY CAPTAINS ──
exports.findNearbyCaptains = async (lng, lat, vehicle, radiusKm = 10) => {
  try {
    // Try geo-nearby first
    const nearby = await User.find({
      role: "driver",
      isAvailable: { $ne: false },
      captainStatus: "approved",
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
    }).select("_id name vehicleNo vehicle");

    if (nearby.length > 0) return nearby;

    // Fallback: all approved+available drivers
    console.log("⚠️  No nearby captains via geo — returning all available drivers");
    return await User.find({
      role: "driver",
      isAvailable: { $ne: false },
      captainStatus: "approved",
    }).select("_id name vehicleNo vehicle");

  } catch (err) {
    console.error("findNearbyCaptains error:", err.message);
    // If geo index fails, return all drivers
    return await User.find({ role: "driver", captainStatus: "approved" })
      .select("_id name vehicleNo vehicle");
  }
};

exports.getUserSockets    = () => userSockets;
exports.getCaptainSockets = () => captainSockets;
exports.getIo = () => io;
