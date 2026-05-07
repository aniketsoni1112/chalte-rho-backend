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
const managerRoutes = require("./routes/managerRoutes");
const { initSocket } = require("./socket/socket");

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

const server = http.createServer(app);

connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/manager", managerRoutes);
app.get("/", (req, res) => res.json({ status: "ok", message: "Rapido API Running ✅", version: "1.0" }));
app.get("/api", (req, res) => res.json({ status: "ok", message: "Rapido API Running ✅", routes: ["/api/auth", "/api/rides", "/api/chat", "/api/user", "/api/admin"] }));
app.get("/test", (req, res) => res.send("API Working ✅"));
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

initSocket(server);
const PORT = process.env.PORT || 8200;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📱 Local network: http://192.168.1.8:${PORT}`);
    console.log(`✅ Test: http://192.168.1.8:${PORT}/test`);
});