// const ChatMessage = require("../models/ChatMessage");
// const Ride = require("../models/Ride");
// const { calculateFare } = require("../utils/fare");

// const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
// const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
// const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || "120000");

// const SYSTEM_PROMPT = `You are "Rapido Dost", a smart ride-hailing assistant for a Rapido-like app.
// You help users book rides, check fares, track rides, cancel rides, and answer FAQs.
// Detect the user's language and always reply in the SAME language (Hindi, English, Hinglish, etc.).
// When user wants to book a ride, extract: vehicle type (bike/auto/cab), pickup location, destination.
// When user asks for fare estimate, extract: pickup, destination, vehicle.
// When user asks ride status or captain location → action STATUS.
// When user wants to cancel → action CANCEL.
// For FAQs about payments, safety, lost items — answer helpfully.
// OUTPUT RULES (STRICT):
// - Output ONLY a raw JSON object. No markdown. No backticks. No explanation. No extra text before or after.
// - Format: { "reply": "...", "action": "BOOK|FARE|STATUS|CANCEL|FAQ|NONE", "data": {}, "lang": "en|hi|hinglish" }
// - For BOOK: data = { "vehicle": "bike|auto|cab", "pickup_address": "...", "destination_address": "..." }
// - For FARE: data = { "vehicle": "bike|auto|cab", "pickup_address": "...", "destination_address": "..." }
// - Keep reply short and friendly.`;

// const OFFLINE_MESSAGES = {
//   hi: "🙏 Abhi server thoda busy hai. Thodi der baad try karein.",
//   en: "⚠️ AI server is busy right now. Please try again in a moment.",
// };

// async function getAIResponse(userMessage, history) {
//   const historyText = history.slice(-6)
//     .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.message}`)
//     .join("\n");

//   const prompt = `${SYSTEM_PROMPT}\n\nConversation:\n${historyText}\nUser: ${userMessage}\nAssistant:`;

//   const response = await fetch(OLLAMA_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       model: OLLAMA_MODEL,
//       prompt,
//       stream: false,
//       options: { temperature: 0.2, num_predict: 256 },
//     }),
//     signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
//   });

//   if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

//   const { response: text } = await response.json();
//   const cleaned = text.trim().replace(/```json|```/g, "").trim();

//   // Extract JSON even if model adds extra text
//   const match = cleaned.match(/\{[\s\S]*\}/);
//   try {
//     return JSON.parse(match ? match[0] : cleaned);
//   } catch {
//     return { reply: cleaned, action: "NONE", data: {}, lang: "en" };
//   }
// }

// exports.chat = async (req, res) => {
//   const { message, pickup, destination } = req.body;
//   const userId = req.user.id;

//   await ChatMessage.create({ user: userId, role: "user", message });

//   const history = await ChatMessage.find({ user: userId })
//     .sort({ createdAt: -1 }).limit(10).lean();
//   history.reverse();

//   let ai, botReply, meta = {};

//   try {
//     ai = await getAIResponse(message, history);
//     botReply = ai.reply;
//   } catch (err) {
//     console.error("Ollama error:", err.message);
//     const lang = /[\u0900-\u097F]/.test(message) ? "hi" : "en";
//     const msg = OFFLINE_MESSAGES[lang];
//     await ChatMessage.create({ user: userId, role: "bot", message: msg });
//     return res.status(503).json({ reply: msg });
//   }

//   // --- FARE ---
//   if (ai.action === "FARE" && pickup && destination) {
//     const vehicle = ai.data?.vehicle || "bike";
//     const fare = calculateFare(pickup, destination, vehicle);
//     botReply = `Estimated fare for ${vehicle}: ₹${fare}. Want me to book it?`;
//     meta = { fare, vehicle };
//   }

//   // --- BOOK ---
//   if (ai.action === "BOOK" && pickup && destination) {
//     const vehicle = ai.data?.vehicle || "bike";
//     const fare = calculateFare(pickup, destination, vehicle);
//     const ride = await Ride.create({
//       user: userId,
//       pickup: { type: "Point", coordinates: [pickup.lng, pickup.lat], address: ai.data?.pickup_address || "" },
//       destination: { type: "Point", coordinates: [destination.lng, destination.lat], address: ai.data?.destination_address || "" },
//       vehicle,
//       fare,
//       otp: Math.floor(1000 + Math.random() * 9000),
//       status: "searching",
//       paymentMethod: "cash",
//     });
//     global.io.emit("new_ride", ride);
//     botReply = `✅ Ride booked! Searching for a ${vehicle} captain.\n🔑 OTP: ${ride.otp}  💰 Fare: ₹${fare}`;
//     meta = { rideId: ride._id, fare, vehicle, otp: ride.otp };
//   }

//   // --- STATUS ---
//   if (ai.action === "STATUS") {
//     const activeRide = await Ride.findOne({
//       user: userId,
//       status: { $in: ["searching", "accepted", "ongoing"] },
//     }).populate("captain", "name phone").lean();

//     if (!activeRide) {
//       botReply = "You have no active ride right now.";
//     } else if (activeRide.status === "searching") {
//       botReply = "🔍 Still searching for a captain nearby...";
//     } else if (activeRide.status === "accepted") {
//       const captain = activeRide.captain;
//       const loc = activeRide.captainLocation;
//       botReply = `🏍️ Captain ${captain?.name || "assigned"} (📞 ${captain?.phone || "N/A"}) is on the way!`
//         + (loc ? `\n📍 Last location: (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})` : "");
//       meta = { captain, captainLocation: activeRide.captainLocation };
//     } else {
//       botReply = `🚀 Your ride is ongoing. OTP: ${activeRide.otp}`;
//     }
//   }

//   // --- CANCEL ---
//   if (ai.action === "CANCEL") {
//     const activeRide = await Ride.findOneAndUpdate(
//       { user: userId, status: { $in: ["searching", "accepted"] } },
//       { status: "cancelled" },
//       { new: true }
//     );
//     botReply = activeRide ? "❌ Your ride has been cancelled." : "No active ride to cancel.";
//   }

//   await ChatMessage.create({ user: userId, role: "bot", message: botReply, meta });
//   global.io.to(`user_${userId}`).emit("bot_message", { message: botReply, meta });

//   res.json({ reply: botReply, action: ai.action, meta });
// };

// exports.getHistory = async (req, res) => {
//   try {
//     const messages = await ChatMessage.find({ user: req.user.id })
//       .sort({ createdAt: 1 }).limit(50).lean();
//     res.json(messages);
//   } catch (err) {
//     res.status(500).json({ msg: err.message });
//   }
// };


const ChatMessage = require("../models/ChatMessage");
const Ride = require("../models/Ride");
const { calculateFare } = require("../utils/fare");

// Config
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || "120000");

// 🔥 SUPER PROMPT
const SYSTEM_PROMPT = `
You are "Rapido Dost", a smart ride assistant.

- Understand ride queries (book, fare, cancel, status)
- Detect Hindi / English / Hinglish
- Reply in SAME language style
- Friendly tone (like bhai / friend)

Return ONLY JSON:
{
  "reply": "...",
  "action": "BOOK|FARE|STATUS|CANCEL|NONE",
  "data": {
    "vehicle": "bike|auto",
    "pickup_address": "...",
    "destination_address": "..."
  },
  "lang": "en|hi|hinglish"
}
`;

// --- AI Function ---
async function getAIResponse(userMessage, history) {
  const historyText = history.slice(-5)
    .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.message}`)
    .join("\n");

  const prompt = `${SYSTEM_PROMPT}

Conversation:
${historyText}

User: ${userMessage}
Assistant:`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 }
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
    });

    const data = await response.json();
    let text = data.response.trim().replace(/```json|```/g, "").trim();

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (err) {
    console.error("AI Error:", err.message);
    return null;
  }
}

// --- MAIN CONTROLLER ---
exports.chat = async (req, res) => {
  const { message, pickup, destination } = req.body;
  const userId = req.user?.id || "guest_user";

  try {
    // 1. Save user msg
    await ChatMessage.create({ user: userId, role: "user", message });

    // 2. Get history
    const history = await ChatMessage.find({ user: userId })
      .sort({ createdAt: -1 }).limit(6).lean();
    history.reverse();

    // 3. AI response
    const ai = await getAIResponse(message, history);

    // 🔥 FALLBACK (IMPORTANT)
    if (!ai || !ai.reply) {
      const isHindi = /[\u0900-\u097F]/.test(message);

      const fallbackReply = isHindi
        ? "Bhai samajh nahi aaya 😅 Ride book karni hai, fare check karna hai ya status dekhna hai?"
        : "I didn't understand 😅 Do you want to book a ride, check fare, or see status?";

      return res.json({ reply: fallbackReply, action: "NONE" });
    }

    let botReply = ai.reply;
    let action = ai.action || "NONE";
    let meta = {};

    // 🔥 HANDLE MISSING DATA
    if (action === "BOOK" && (!pickup || !destination)) {
      botReply = ai.lang === "en"
        ? "Please share pickup and destination 📍"
        : "Bhai pickup aur destination bata do 📍";

      action = "NONE";
    }

    // --- FARE ---
    if (action === "FARE" && pickup && destination) {
      const vehicle = ai.data?.vehicle || "bike";
      const fare = calculateFare(pickup, destination, vehicle);

      if (ai.lang === "en") {
        botReply = `Estimated fare for ${vehicle}: ₹${fare}. Book karu?`;
      } else {
        botReply = `Bhai ${vehicle} ka fare ₹${fare} hoga 😎 Book kar du?`;
      }

      meta = { fare, vehicle };
    }

    // --- BOOK ---
    if (action === "BOOK" && pickup && destination) {
      const vehicle = ai.data?.vehicle || "bike";
      const fare = calculateFare(pickup, destination, vehicle);

      const ride = await Ride.create({
        user: userId,
        pickup: {
          type: "Point",
          coordinates: [pickup.lng, pickup.lat],
          address: pickup.address
        },
        destination: {
          type: "Point",
          coordinates: [destination.lng, destination.lat],
          address: destination.address
        },
        vehicle,
        fare,
        otp: Math.floor(1000 + Math.random() * 9000),
        status: "searching",
      });

      if (global.io) global.io.emit("new_ride", ride);

      if (ai.lang === "en") {
        botReply = `✅ Ride booked! OTP: ${ride.otp}. Finding captain...`;
      } else {
        botReply = `✅ Ride book ho gayi! OTP: ${ride.otp}. Captain dhund raha hoon 🚀`;
      }

      meta = { rideId: ride._id, otp: ride.otp, fare };
    }

    // --- STATUS ---
    if (action === "STATUS") {
      const ride = await Ride.findOne({
        user: userId,
        status: { $in: ["searching", "accepted", "ongoing"] }
      });

      if (ai.lang === "en") {
        botReply = ride
          ? (ride.status === "searching"
              ? "🔍 Finding your captain..."
              : `🏍️ Captain coming! OTP: ${ride.otp}`)
          : "No active ride";
      } else {
        botReply = ride
          ? (ride.status === "searching"
              ? "🔍 Captain dhund raha hoon..."
              : `🏍️ Captain aa raha hai! OTP: ${ride.otp}`)
          : "Koi active ride nahi hai";
      }
    }

    // --- CANCEL ---
    if (action === "CANCEL") {
      const cancelled = await Ride.findOneAndUpdate(
        { user: userId, status: { $in: ["searching", "accepted"] } },
        { status: "cancelled" }
      );

      if (ai.lang === "en") {
        botReply = cancelled
          ? "❌ Ride cancelled"
          : "No ride to cancel";
      } else {
        botReply = cancelled
          ? "❌ Ride cancel ho gayi"
          : "Cancel karne ke liye koi ride nahi hai";
      }
    }

    // Save bot msg
    await ChatMessage.create({
      user: userId,
      role: "bot",
      message: botReply,
      meta
    });

    // Socket emit
    if (global.io) {
      global.io.to(`user_${userId}`).emit("bot_message", {
        message: botReply,
        meta
      });
    }

    return res.json({ reply: botReply, action, meta });

  } catch (err) {
    console.error("Server Error:", err.message);
    return res.status(500).json({
      reply: "Server error, try again",
      action: "NONE"
    });
  }
};

// --- HISTORY ---
exports.getHistory = async (req, res) => {
  const messages = await ChatMessage.find({ user: req.user.id })
    .sort({ createdAt: 1 });

  res.json(messages);
};