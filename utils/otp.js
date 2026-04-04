const axios = require("axios");

const otpStore = {}; // { phone: { otp, expiry } }

exports.sendOtp = async (phone) => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[phone] = { otp, expiry: Date.now() + 5 * 60 * 1000 };

  try {
    await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: process.env.FAST2SMS_KEY,
        variables_values: otp,
        route: "otp",
        numbers: phone,
      },
    });
  } catch (err) {
    console.error("Fast2SMS error:", err.message);
  }

  console.log(`OTP for ${phone}: ${otp}`); // dev log
  return otp;
};

exports.verifyOtp = (phone, otp) => {
  const record = otpStore[phone];
  if (!record) return false;
  if (Date.now() > record.expiry) { delete otpStore[phone]; return false; }
  if (record.otp !== Number(otp)) return false;
  delete otpStore[phone];
  return true;
};
