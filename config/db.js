const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ridebooking");
  mongoose.set("strictPopulate", false); // allow populating fields not in schema
  console.log("MongoDB Connected");
};

module.exports = connectDB;