const crypto = require("crypto");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { calculateFare } = require("../utils/fare");
const { sendNotification } = require("../utils/push");
const { emitToUser, emitToCaptain, findNearbyCaptains } = require("../socket/socket");

// Generate secure 4-digit OTP
const generateOTP = () => parseInt(crypto.randomInt(1000, 9999));

// ─────────────────────────────────────────────
// PHASE 1: BOOKING — Create ride, lock fare, find captains
// ─────────────────────────────────────────────
exports.requestRide = async (req, res) => {
  try {
    const { pickup, destination, vehicle, paymentMethod } = req.body;

    // Fare lock — saved at booking time, won't change
    const fare = calculateFare(pickup, destination, vehicle);

    // Generate OTP at ride creation — stored in DB, only sent to user
    const otp = generateOTP();

    const userId = req.user.id || req.user._id;

    const ride = await Ride.create({
      user: userId,
      pickup: {
        type: "Point",
        coordinates: [pickup.lng, pickup.lat],
        address: pickup.address || "",
      },
      destination: {
        type: "Point",
        coordinates: [destination.lng, destination.lat],
        address: destination.address || destination,
      },
      vehicle: vehicle || "bike",
      fare,       // locked fare
      otp,        // secure OTP stored in DB
      status: "searching",
      paymentMethod: paymentMethod || "cash",
    });

    console.log(`🎫 Ride ${ride._id} created | OTP: ${otp} | Fare: ₹${fare}`);

    // Join user to ride room for multicast
    global.io.in(`user_${userId}`).socketsJoin(`ride_${ride._id}`);

    // PHASE 2: GEOSPATIAL SEARCH — find nearby captains
    const lng = pickup.lng;
    const lat = pickup.lat;
    const nearbyCaptains = await findNearbyCaptains(lng, lat, vehicle, 5);

    console.log(`📍 Found ${nearbyCaptains.length} captains within 5km`);

    const ridePayload = {
      _id: ride._id,
      pickup: { lat, lng, address: pickup.address || "" },
      destination: { lat: destination.lat, lng: destination.lng, address: destination.address || "" },
      vehicle: ride.vehicle,
      fare: ride.fare,
      status: ride.status,
      distanceKm: "~2 km",
    };

    if (nearbyCaptains.length > 0) {
      // Multicast only to nearby captains
      nearbyCaptains.forEach((captain) => {
        emitToCaptain(captain._id.toString(), "new_ride", ridePayload);
      });
    } else {
      // Fallback: broadcast to all online captains
      global.io.emit("new_ride", ridePayload);
    }

    // Confirm to user — UI switches to SEARCHING
    emitToUser(userId, "ride_status_update", {
      status: "searching",
      rideId: ride._id,
      message: `Looking for captains nearby... (${nearbyCaptains.length} found)`,
    });

    console.log(`📡 Emitting to user_${userId}`);

    // Return ride WITH otp to user's app
    res.json({
      _id: ride._id,
      otp: ride.otp,       // sent to user only
      fare: ride.fare,
      status: ride.status,
      vehicle: ride.vehicle,
      paymentMethod: ride.paymentMethod,
      pickup: { lat, lng, address: pickup.address || "" },
      destination: { lat: destination.lat, lng: destination.lng, address: destination.address || "" },
    });
  } catch (err) {
    console.error("requestRide error:", err.message);
    res.status(500).json({ msg: err.message });
  }
};

exports.estimateFare = (req, res) => {
  try {
    const { pickup, destination, vehicle } = req.body;
    const fare = calculateFare(pickup, destination, vehicle);
    res.json({ fare, vehicle });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// PHASE 3: ACCEPTANCE — Atomic update, prevent double-accept
// ─────────────────────────────────────────────
exports.acceptRide = async (req, res) => {
  try {
    // Atomic update — only succeeds if status is still "searching"
    const updated = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: "searching" },
      { driver: req.user.id, status: "accepted" },
      { returnDocument: "after" }
    );

    if (!updated) {
      return res.status(409).json({ msg: "Ride already accepted by another captain" });
    }

    // Fetch full ride with populated fields after update
    const ride = await Ride.findById(req.params.id)
      .populate("user", "name phone pushSubscription")
      .populate("driver", "name phone vehicleNo vehicle");

    if (!ride || !ride.driver) {
      return res.status(500).json({ msg: "Failed to load ride after accept" });
    }

    console.log(`✅ Ride ${ride._id} accepted by ${ride.driver.name} | OTP: ${ride.otp}`);

    const userId = ride.user._id.toString();
    const captainId = ride.driver._id.toString();

    // Join captain to ride room
    global.io.in(`user_${captainId}`).socketsJoin(`ride_${ride._id}`);

    // PHASE 4: OTP — Send to USER only, captain does NOT see it yet
    emitToUser(userId, "ride_accepted", {
      _id: ride._id,
      otp: ride.otp,          // OTP sent to user only
      fare: ride.fare,
      vehicle: ride.vehicle,
      paymentMethod: ride.paymentMethod,
      status: "accepted",
      driver: {
        _id: ride.driver._id,
        name: ride.driver.name,
        phone: ride.driver.phone,
        vehicleNo: ride.driver.vehicleNo || "MP 09 AB 1234",
        vehicle: ride.driver.vehicle || ride.vehicle,
        rating: 4.8,
      },
    });

    // Notify captain — pickup location, user details (NO OTP)
    emitToCaptain(captainId, "ride_assigned", {
      rideId: ride._id,
      pickup: {
        lat: ride.pickup.coordinates[1],
        lng: ride.pickup.coordinates[0],
        address: ride.pickup.address,
      },
      destination: {
        lat: ride.destination.coordinates[1],
        lng: ride.destination.coordinates[0],
        address: ride.destination.address,
      },
      fare: ride.fare,
      vehicle: ride.vehicle,
      user: { name: ride.user.name, phone: ride.user.phone },
      message: "Navigate to pickup point! Ask rider for OTP.",
    });

    // Web Push to user
    if (ride.user?.pushSubscription) {
      await sendNotification(ride.user._id, {
        title: "Captain Found! 🏍️",
        body: `${ride.driver.name} is on the way. Your OTP: ${ride.otp}`,
      });
    }

    res.json(ride);
  } catch (err) {
    console.error("acceptRide error:", err.message);
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// PHASE 5: ARRIVAL ALERT — Captain near pickup
// ─────────────────────────────────────────────
exports.captainArrived = async (req, res) => {
  try {
    await Ride.findByIdAndUpdate(req.params.id, { status: "arrived" });
    const ride = await Ride.findById(req.params.id).populate("user", "name pushSubscription");

    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    // Notify user — captain has arrived, share OTP now
    emitToUser(ride.user._id.toString(), "captain_arrived", {
      rideId: ride._id,
      message: "Your captain has arrived! Share your OTP to start the ride.",
      otp: ride.otp,
    });

    if (ride.user?.pushSubscription) {
      await sendNotification(ride.user._id, {
        title: "Captain Arrived! 📍",
        body: "Your captain is at the pickup point. Share your OTP to start.",
      });
    }

    res.json({ msg: "Arrival notified", rideId: ride._id });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// PHASE 5b: OTP VERIFY → START RIDE
// ─────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;

    // Fetch ride with all fields
    const ride = await Ride.findById(req.params.id)
      .populate("user", "name phone pushSubscription")
      .populate("driver", "name");

    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (!ride.otp) return res.status(400).json({ msg: "OTP not generated for this ride" });
    if (ride.otpVerified || ride.status === "ongoing")
      return res.status(400).json({ msg: "Ride already started" });
    if (ride.otp !== Number(otp))
      return res.status(400).json({ msg: "Invalid OTP ❌ Please try again" });

    // Atomic status change — findOneAndUpdate ensures no race condition
    const updatedRide = await Ride.findOneAndUpdate(
      { _id: ride._id, status: { $in: ["searching", "accepted", "arrived"] } },
      { status: "ongoing", startTime: new Date(), otpVerified: true },
      { returnDocument: "after" }
    );

    if (!updatedRide) return res.status(400).json({ msg: "Ride cannot be started — invalid status" });

    console.log(`🚀 Ride ${ride._id} started at ${updatedRide.startTime}`);

    const userId = ride.user._id.toString();
    const captainId = ride.driver._id.toString();

    const { getUserSockets } = require("../socket/socket");
    console.log(`🔍 verifyOTP | userId: ${userId} | userSockets:`, Object.keys(getUserSockets()));

    // Notify user — ride started
    emitToUser(userId, "ride_started", {
      rideId: ride._id,
      status: "ongoing",
      startTime: updatedRide.startTime,
    });

    // Notify captain — OTP verified, navigate to destination
    emitToCaptain(captainId, "ride_started_confirm", {
      rideId: ride._id,
      message: "OTP verified! Ride started. Navigate to destination.",
      destination: {
        lat: ride.destination.coordinates[1],
        lng: ride.destination.coordinates[0],
        address: ride.destination.address,
      },
    });

    // Web Push to user
    if (ride.user?.pushSubscription) {
      await sendNotification(ride.user._id, {
        title: "Ride Started! 🚀",
        body: `Your ride with ${ride.driver?.name} has begun. Have a safe trip!`,
      });
    }

    res.json(updatedRide);
  } catch (err) {
    console.error("verifyOTP error:", err.message);
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// COMPLETE RIDE
// ─────────────────────────────────────────────
exports.completeRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("user", "name phone pushSubscription")
      .populate("driver", "name");

    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (ride.status !== "ongoing") return res.status(400).json({ msg: "Ride is not ongoing" });

    ride.status = "completed";
    ride.endTime = new Date();
    ride.paymentStatus = ride.paymentMethod === "cash" ? "paid" : "pending";

    if (ride.paymentMethod === "wallet") {
      const user = await User.findById(ride.user._id);
      if (user.wallet < ride.fare) return res.status(400).json({ msg: "Insufficient wallet balance" });
      user.wallet -= ride.fare;
      await user.save();
      await User.findByIdAndUpdate(ride.driver._id, { $inc: { wallet: ride.fare } });
      ride.paymentStatus = "paid";
    }

    await ride.save();

    // Multicast to ride room
    global.io.to(`ride_${ride._id}`).emit("ride_completed", {
      rideId: ride._id,
      fare: ride.fare,
      paymentMethod: ride.paymentMethod,
      status: "completed",
    });

    if (ride.user?.pushSubscription) {
      await sendNotification(ride.user._id, {
        title: "Ride Complete! 🎉",
        body: `Fare: ₹${ride.fare}. Rate your captain!`,
      });
    }

    res.json(ride);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// CANCEL RIDE
// ─────────────────────────────────────────────
exports.cancelRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("user", "name pushSubscription")
      .populate("driver", "name");

    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (["ongoing", "completed"].includes(ride.status))
      return res.status(400).json({ msg: "Cannot cancel an ongoing or completed ride" });

    ride.status = "cancelled";
    await ride.save();

    emitToUser(ride.user._id.toString(), "ride_cancelled", {
      rideId: ride._id, reason: req.body.reason || "Cancelled by user",
    });
    if (ride.driver) {
      emitToCaptain(ride.driver._id.toString(), "ride_cancelled", {
        rideId: ride._id, message: "Rider cancelled the trip",
      });
    }

    res.json({ msg: "Ride cancelled", ride });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.rateRide = async (req, res) => {
  try {
    const { rating, by } = req.body;
    const update = by === "driver" ? { driverRating: rating } : { userRating: rating };
    await Ride.findByIdAndUpdate(req.params.id, update);
    const ride = await Ride.findById(req.params.id);
    res.json(ride);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getRideHistory = async (req, res) => {
  try {
    const filter = req.user.role === "driver" ? { driver: req.user.id } : { user: req.user.id };
    const rides = await Ride.find({ ...filter, status: "completed" })
      .populate("user", "name").populate("driver", "name")
      .sort({ createdAt: -1 }).limit(20);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getAllRides = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const rides = await Ride.find(filter)
      .populate("user", "name email").populate("driver", "name email")
      .sort({ createdAt: -1 }).limit(100);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
