const express = require("express");
const http = require("http");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const rideRoutes = require("./routes/rideRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { initSocket } = require("./socket/socket");

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "bypass-tunnel-reminder", "x-forwarded-host", "cf-access-client-id", "cf-access-client-secret"]
}));

// Bypass cloudflared browser warning for all requests
app.use((req, res, next) => {
    res.setHeader("bypass-tunnel-reminder", "true");
    next();
});

app.use(express.json());

const server = http.createServer(app);

connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.get("/", (req, res) => res.json({ status: "ok", message: "Rapido API Running ✅", version: "1.0" }));
app.get("/api", (req, res) => res.json({ status: "ok", message: "Rapido API Running ✅", routes: ["/api/auth", "/api/rides", "/api/chat", "/api/user", "/api/admin"] }));
app.get("/test", (req, res) => res.send("API Working ✅"));
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

initSocket(server);
const PORT = process.env.PORT || 5009;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});