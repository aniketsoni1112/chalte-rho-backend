const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, sparse: true, set: (v) => v === "" ? undefined : v },
  phone: { type: String, unique: true, sparse: true, set: (v) => v === "" ? undefined : v },
  password: String,
  role: { type: String, enum: ["user", "driver", "admin"], default: "user" },
  wallet: { type: Number, default: 0 },
  pushSubscription: { type: Object, default: null },
  upiIds: [String],
  savedAddresses: [{ type: String, address: String }],
  emergencyContacts: [{ name: String, phone: String }],
  activePass: { plan: String, expiry: Date },

  // Captain geospatial location (GeoJSON Point)
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  isOnline: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: false }, // true = online & not on a ride
  vehicle: { type: String, enum: ["bike", "auto", "cab"], default: "bike" },
  vehicleNo: { type: String, default: "" },
  profileImage: { type: String, default: "" }, // base64 or URL
}, { timestamps: true });

// 2dsphere index for geospatial queries
userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
