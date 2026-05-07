const nodemailer = require("nodemailer");

const otpStore = {};

// Always create fresh transporter — reads from process.env each time
const getTransporter = () => nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── SEND EMAIL OTP ──
exports.sendEmailOtp = async (email, purpose = "login") => {
  const otp = generateOtp();
  otpStore[email] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };

  const subject =
    purpose === "reset"
      ? "Chalterho — Reset Your Password"
      : "Chalterho — Your Login Verification Code";

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:40px 20px;">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:#f59e0b;padding:32px;text-align:center;">
                <div style="font-size:40px;">🏍️</div>
                <h1 style="color:#fff;margin:8px 0 4px;font-size:24px;font-weight:900;">chalte rho</h1>
                <p style="color:#fef3c7;margin:0;font-size:14px;">Your ride, your way</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hello 👋</p>
                <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
                  ${purpose === "reset"
                    ? "Use the code below to reset your password. This code expires in <strong>5 minutes</strong>."
                    : "Use the code below to verify your identity. This code expires in <strong>5 minutes</strong>."}
                </p>
                <!-- OTP Box -->
                <div style="background:#fef3c7;border:2px dashed #f59e0b;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
                  <p style="color:#92400e;font-size:12px;font-weight:700;letter-spacing:2px;margin:0 0 8px;">YOUR VERIFICATION CODE</p>
                  <p style="color:#d97706;font-size:48px;font-weight:900;letter-spacing:12px;margin:0;">${otp}</p>
                </div>
                <p style="color:#9ca3af;font-size:12px;margin:0;">
                  If you didn't request this, please ignore this email. Never share this code with anyone.
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">© 2024 Chalterho. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  await getTransporter().sendMail({
    from: `"Chalterho 🏍️" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html,
  });

  return otp; // returned for testing only
};

// ── VERIFY OTP ──
exports.verifyEmailOtp = (email, otp) => {
  const record = otpStore[email];
  if (!record) return { valid: false, msg: "OTP not found. Please request a new one." };
  if (Date.now() > record.expiresAt) {
    delete otpStore[email];
    return { valid: false, msg: "OTP expired. Please request a new one." };
  }
  if (record.otp !== String(otp)) return { valid: false, msg: "Invalid OTP. Please try again." };
  delete otpStore[email]; // one-time use
  return { valid: true };
};

// ── MARK EMAIL VERIFIED (for reset password flow) ──
const verifiedEmails = {}; // { email: expiresAt }

exports.markEmailVerified = (email) => {
  verifiedEmails[email] = Date.now() + 10 * 60 * 1000; // 10 min to reset
};

exports.isEmailVerified = (email) => {
  const exp = verifiedEmails[email];
  if (!exp || Date.now() > exp) return false;
  return true;
};

exports.clearEmailVerified = (email) => {
  delete verifiedEmails[email];
};
