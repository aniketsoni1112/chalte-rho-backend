const crypto = require("crypto");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { calculateFare } = require("../utils/fare");
const { sendNotification } = require("../utils/push");
const { emitToUser, emitToCaptain, sendRideToDrivers, findNearbyCaptains, getUserSockets } = require("../socket/socket");

const generateOTP = () => parseInt(crypto.randomInt(1000, 9999));

// ─────────────────────────────────────────────
// BOOKING
// ─────────────────────────────────────────────
exports.requestRide = async (req, res) => {
  try {
    const { pickup, destination, vehicle, paymentMethod } = req.body;
    const fare = calculateFare(pickup, destination, vehicle);
    const otp = generateOTP();
    const userId = req.user.id;

    // Cancel any stuck searching rides for this user
    await Ride.updateMany({ user: userId, status: "searching" }, { $set: { status: "cancelled" } });

    const ride = await Ride.create({
      user: userId,
      pickup: { type: "Point", coordinates: [pickup.lng, pickup.lat], address: pickup.address || "" },
      destination: { type: "Point", coordinates: [destination.lng, destination.lat], address: destination.address || "" },
      vehicle: vehicle || "bike",
      fare, otp, status: "searching",
      paymentMethod: paymentMethod || "cash",
    });

    console.log(`🎫 Ride ${ride._id} | OTP: ${otp} | Fare: ₹${fare} | User: ${userId}`);
    global.io.in(`user_${userId}`).socketsJoin(`ride_${ride._id}`);

    const nearbyCaptains = await findNearbyCaptains(pickup.lng, pickup.lat, vehicle, 10);
    console.log(`📍 Nearby captains: ${nearbyCaptains.length}`);

    // Populate user for the ride payload
    const rideWithUser = await Ride.findById(ride._id).populate("user", "name").lean();

    const ridePayload = {
      _id: ride._id.toString(),
      pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address || "" },
      destination: { lat: destination.lat, lng: destination.lng, address: destination.address || "" },
      vehicle: ride.vehicle, fare: ride.fare, status: ride.status,
      user: { name: rideWithUser?.user?.name || "Rider", phone: null },
    };

    sendRideToDrivers(ridePayload, userId);
    emitToUser(userId, "ride_status_update", { status: "searching", rideId: ride._id });

    res.json({
      _id: ride._id, otp: ride.otp, fare: ride.fare, status: ride.status,
      vehicle: ride.vehicle, paymentMethod: ride.paymentMethod,
      pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address || "" },
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
    res.json({ fare: calculateFare(pickup, destination, vehicle), vehicle });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// ACCEPT RIDE
// ─────────────────────────────────────────────
exports.acceptRide = async (req, res) => {
  try {
    const driverId = req.user.id;

    // ── 1. APPROVAL GATE ──
    const captain = await User.findById(driverId)
      .select("captainStatus name phone profileImage vehicleNumber rcCardNumber vehicle location isAvailable");
    if (!captain) return res.status(404).json({ msg: "Captain not found" });
    if (captain.captainStatus === "pending")
      return res.status(403).json({ msg: "Your account is pending approval by a Manager. Please wait." });
    if (captain.captainStatus === "rejected")
      return res.status(403).json({ msg: "Your account has been rejected. Please contact support." });

    // ── 2. ATOMIC ACCEPT — prevent race condition ──
    const updated = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: "searching" },
      { driver: driverId, captain: driverId, status: "accepted" },
      { new: true }
    );
    if (!updated) return res.status(409).json({ msg: "Ride already accepted by another captain" });

    // ── 3. POPULATE FULL RIDE DATA ──
    const ride = await Ride.findById(req.params.id)
      .populate("user", "name phone profileImage pushSubscription")
      .populate("driver", "name phone profileImage vehicleNumber rcCardNumber vehicle location");
    if (!ride?.driver) return res.status(500).json({ msg: "Failed to load ride after accept" });

    const userId    = ride.user._id.toString();
    const captainId = ride.driver._id.toString();

    await User.findByIdAndUpdate(driverId, { isAvailable: false });
    global.io.in(`user_${captainId}`).socketsJoin(`ride_${ride._id}`);

    // ── 4. CAPTAIN CURRENT LOCATION ──
    const captainLocation = ride.driver.location?.coordinates?.length === 2
      ? { lat: ride.driver.location.coordinates[1], lng: ride.driver.location.coordinates[0] }
      : null;

    // ── 5. TO USER: full captain profile + vehicle details ──
    const userPayload = {
      _id:          ride._id.toString(),
      rideId:       ride._id.toString(),
      otp:          ride.otp,
      fare:         ride.fare,
      vehicle:      ride.vehicle,
      paymentMethod: ride.paymentMethod,
      status:       "accepted",
      captain: {
        _id:            captainId,
        captainName:    ride.driver.name,
        phone:          ride.driver.phone,
        photo:          ride.driver.profileImage || null,
        vehicleNumber:  ride.driver.vehicleNumber || "N/A",
        vehicleModel:   ride.driver.vehicle || ride.vehicle,
        rcDetails:      ride.driver.rcCardNumber || "N/A",
        currentLocation: captainLocation,
        rating:         4.8,
      },
      // also expose as driver for backward compat
      driver: {
        _id:            captainId,
        captainName:    ride.driver.name,
        name:           ride.driver.name,
        phone:          ride.driver.phone,
        vehicleNumber:  ride.driver.vehicleNumber || "N/A",
        vehicleNo:      ride.driver.vehicleNumber || "N/A",
        vehicle:        ride.driver.vehicle || ride.vehicle,
        currentLocation: captainLocation,
        rating:         4.8,
      },
    };
    emitToUser(userId, "ride_confirmed", userPayload);
    emitToUser(userId, "ride_accepted",  userPayload); // backward compat

    // ── 6. TO CAPTAIN: user profile + full ride details ──
    const captainPayload = {
      _id:     ride._id.toString(),
      rideId:  ride._id.toString(),
      fare:    ride.fare,
      vehicle: ride.vehicle,
      pickup: {
        lat:     ride.pickup.coordinates[1],
        lng:     ride.pickup.coordinates[0],
        address: ride.pickup.address,
      },
      destination: {
        lat:     ride.destination.coordinates[1],
        lng:     ride.destination.coordinates[0],
        address: ride.destination.address,
      },
      user: {
        _id:   userId,
        name:  ride.user.name,
        phone: ride.user.phone,
        photo: ride.user.profileImage || null,
      },
    };
    emitToCaptain(captainId, "ride_confirmed", captainPayload);
    emitToCaptain(captainId, "ride_assigned",  captainPayload); // backward compat

    // ── 7. PUSH NOTIFICATION ──
    if (ride.user?.pushSubscription)
      await sendNotification(ride.user._id, {
        title: "Captain Found! 🏍️",
        body:  `${ride.driver.name} is on the way. Vehicle: ${ride.driver.vehicleNumber || "N/A"}`,
      });

    console.log(`✅ ride_confirmed emitted | captain: ${captainId} → user: ${userId}`);
    res.json({ msg: "Ride confirmed", rideId: ride._id.toString() });
  } catch (err) {
    console.error("acceptRide error:", err.message);
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// CAPTAIN ARRIVED
// ─────────────────────────────────────────────
exports.captainArrived = async (req, res) => {
  try {
    await Ride.findByIdAndUpdate(req.params.id, { status: "arrived" });
    const ride = await Ride.findById(req.params.id).populate("user", "name pushSubscription");
    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    emitToUser(ride.user._id.toString(), "captain_arrived", {
      rideId: ride._id, otp: ride.otp,
      message: "Your captain has arrived! Share your OTP to start the ride.",
    });

    if (ride.user?.pushSubscription)
      await sendNotification(ride.user._id, { title: "Captain Arrived! 📍", body: "Share your OTP to start." });

    res.json({ msg: "Arrival notified", rideId: ride._id });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ─────────────────────────────────────────────
// VERIFY OTP → START RIDE
// ─────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const ride = await Ride.findById(req.params.id)
      .populate("user", "name phone pushSubscription")
      .populate("driver", "name");

    if (!ride) return res.status(404).json({ msg: "Ride not found" });
    if (!ride.otp) return res.status(400).json({ msg: "OTP not generated for this ride" });
    if (ride.otpVerified || ride.status === "ongoing")
      return res.status(400).json({ msg: "Ride already started" });
    if (ride.otp !== Number(otp))
      return res.status(400).json({ msg: "Invalid OTP ❌ Please try again" });

    const updatedRide = await Ride.findOneAndUpdate(
      { _id: ride._id, status: { $in: ["searching", "accepted", "arrived"] } },
      { status: "ongoing", startTime: new Date(), otpVerified: true },
      { new: true }
    );
    if (!updatedRide) return res.status(400).json({ msg: "Ride cannot be started — invalid status" });

    const userId = ride.user._id.toString();
    const captainId = ride.driver._id.toString();
    console.log(`🚀 Ride started | userId: ${userId} | captainId: ${captainId} | sockets: ${JSON.stringify(Object.keys(getUserSockets()))}`);

    emitToUser(userId, "ride_started", {
      rideId: ride._id, status: "ongoing", startTime: updatedRide.startTime,
    });

    emitToCaptain(captainId, "ride_started_confirm", {
      rideId: ride._id,
      destination: { lat: ride.destination.coordinates[1], lng: ride.destination.coordinates[0], address: ride.destination.address },
    });

    if (ride.user?.pushSubscription)
      await sendNotification(ride.user._id, { title: "Ride Started! 🚀", body: `Your ride with ${ride.driver?.name} has begun.` });

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

    // Phase 5: reset captain to isAvailable true — immediately visible in next geospatial query
    await User.findByIdAndUpdate(ride.driver._id, { isAvailable: true });

    emitToUser(ride.user._id.toString(), "ride_completed", { rideId: ride._id, fare: ride.fare, paymentMethod: ride.paymentMethod, status: "completed" });
    emitToCaptain(ride.driver._id.toString(), "ride_completed", { rideId: ride._id, fare: ride.fare, paymentMethod: ride.paymentMethod, status: "completed" });

    if (ride.user?.pushSubscription)
      await sendNotification(ride.user._id, { title: "Ride Complete! 🎉", body: `Fare: ₹${ride.fare}. Rate your captain!` });

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

    // Reset captain availability on cancel
    if (ride.driver)
      await User.findByIdAndUpdate(ride.driver._id, { isAvailable: true });

    emitToUser(ride.user._id.toString(), "ride_cancelled", { rideId: ride._id, reason: req.body.reason || "Cancelled" });
    if (ride.driver)
      emitToCaptain(ride.driver._id.toString(), "ride_cancelled", { rideId: ride._id });

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
    res.json(await Ride.findById(req.params.id));
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
    const filter = req.query.status ? { status: req.query.status } : {};
    const rides = await Ride.find(filter)
      .populate("user", "name email").populate("driver", "name email")
      .sort({ createdAt: -1 }).limit(100);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
