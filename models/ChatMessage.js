const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role:    { type: String, enum: ["user", "bot"], required: true },
  message: { type: String, required: true },
  meta:    { type: Object, default: {} },
}, { timestamps: true });

// Fast history retrieval per user sorted by time
chatSchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatSchema);
