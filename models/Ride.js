const mongoose = require("mongoose");

const pointSchema = {
  type:        { type: String, enum: ["Point"], default: "Point" },
  coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  address:     { type: String, default: "" },
};

const rideSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  captain: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // legacy alias

  pickup:      pointSchema,
  destination: pointSchema,

  vehicle:       { type: String, enum: ["bike", "auto", "cab"], default: "bike" },
  status: {
    type: String,
    enum: ["pending", "searching", "accepted", "arrived", "ongoing", "completed", "cancelled"],
    default: "pending",
  },

  fare:          { type: Number, required: true },
  otp:           { type: Number },
  otpVerified:   { type: Boolean, default: false },

  startTime:     { type: Date },
  endTime:       { type: Date },

  paymentMethod: { type: String, enum: ["cash", "wallet", "upi"], default: "cash" },
  paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },

  captainLocation: { lat: Number, lng: Number },

  userRating:   Number,
  driverRating: Number,
}, { timestamps: true });

// Geospatial index for pickup location queries
rideSchema.index({ "pickup.coordinates": "2dsphere" });

module.exports = mongoose.model("Ride", rideSchema);
