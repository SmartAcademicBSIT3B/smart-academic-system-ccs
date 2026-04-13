const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { query } = require("../database/dbconnect");

const USED_OTP_RETENTION_MINUTES = parseInt(
  process.env.OTP_USED_RETENTION_MINUTES || "30",
  10,
);

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "smartacademicbsit3b@gmail.com",
    pass: "uxwv qwii eymz phmj",
  },
});

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if user exists by email
 * @param {string} email - User's email address
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function checkUserExists(email) {
  try {
    const users = await query(
      "SELECT id, user_id, name, email FROM users WHERE email = ? AND status = ?",
      [email, "active"],
    );
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error("Error checking user existence:", error);
    throw new Error("Database error while checking user");
  }
}

/**
 * Store OTP in database
 * @param {string} userId - User display ID from users.user_id
 * @param {string} otp - OTP code
 * @param {string} purpose - Purpose of OTP (e.g., 'reset_password')
 * @param {Date} expiresAt - Expiration date
 * @returns {Promise<number>} Inserted OTP record ID
 */
async function storeOTP(
  userId,
  otp,
  purpose = "reset_password",
  expiresAt = null,
) {
  try {
    if (!expiresAt) {
      expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    }

    const result = await query(
      "INSERT INTO otp_codes (user_id, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)",
      [userId, otp, purpose, expiresAt],
    );

    return result.insertId;
  } catch (error) {
    console.error("Error storing OTP:", error);
    throw new Error("Database error while storing OTP");
  }
}

/**
 * Send OTP via email
 * @param {string} email - Recipient email
 * @param {string} otp - OTP code to send
 * @param {string} purpose - Purpose of OTP for email template
 * @returns {Promise<Object>} Nodemailer send result
 */
async function sendOTPEmail(email, otp, purpose = "reset_password") {
  try {
    let subject = "";
    let htmlContent = "";

    switch (purpose) {
      case "reset_password":
        subject = "Password Reset OTP - CCS System";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Hello,</p>
            <p>You have requested to reset your password for the CCS System.</p>
            <p>Your 6-digit OTP is: <strong style="font-size: 24px; color: #007bff;">${otp}</strong></p>
            <p>This OTP will expire in 10 minutes.</p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <br>
            <p>Best regards,<br>CCS System Team</p>
          </div>
        `;
        break;
      case "login":
        subject = "Login OTP - CCS System";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Login Verification</h2>
            <p>Hello,</p>
            <p>Your login OTP for the CCS System is:</p>
            <p style="font-size: 24px; color: #007bff; font-weight: bold;">${otp}</p>
            <p>This OTP will expire in 10 minutes.</p>
            <br>
            <p>Best regards,<br>CCS System Team</p>
          </div>
        `;
        break;
      default:
        subject = "OTP Verification - CCS System";
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">OTP Verification</h2>
            <p>Hello,</p>
            <p>Your OTP is: <strong style="font-size: 24px; color: #007bff;">${otp}</strong></p>
            <p>This OTP will expire in 10 minutes.</p>
            <br>
            <p>Best regards,<br>CCS System Team</p>
          </div>
        `;
    }

    const mailOptions = {
      from: "smartacademicbsit3b@gmail.com",
      to: email,
      subject: subject,
      html: htmlContent,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send email");
  }
}

/**
 * Send OTP to user (complete process)
 * @param {string} email - User's email
 * @param {string} purpose - Purpose of OTP
 * @returns {Promise<Object>} Result object with success status and message
 */
async function sendOTP(email, purpose = "reset_password") {
  try {
    // Check if user exists
    const user = await checkUserExists(email);
    if (!user) {
      return {
        success: false,
        message: "No account found with this email address.",
      };
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in database
    await storeOTP(user.user_id, otp, purpose);

    // Send email
    await sendOTPEmail(email, otp, purpose);

    return {
      success: true,
      message: "OTP sent successfully.",
      userId: user.user_id,
    };
  } catch (error) {
    console.error("Error in sendOTP:", error);
    return {
      success: false,
      message: error.message || "Failed to send OTP. Please try again.",
    };
  }
}

/**
 * Verify OTP
 * @param {string} email - User's email
 * @param {string} otp - OTP code to verify
 * @param {string} purpose - Purpose of OTP
 * @returns {Promise<Object>} Result object with success status and message
 */
async function verifyOTP(email, otp, purpose = "reset_password") {
  try {
    // Get user by email
    const user = await checkUserExists(email);
    if (!user) {
      return { success: false, message: "Invalid request." };
    }

    // Check OTP in database
    const otpRecords = await query(
      "SELECT id FROM otp_codes WHERE user_id = ? AND otp_code = ? AND purpose = ? AND is_used = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [user.user_id, otp, purpose, false],
    );

    if (otpRecords.length === 0) {
      return { success: false, message: "Invalid or expired OTP." };
    }

    // Mark OTP as used
    await query("UPDATE otp_codes SET is_used = ? WHERE id = ?", [
      true,
      otpRecords[0].id,
    ]);

    // Opportunistic cleanup to avoid table growth.
    await cleanupExpiredOTPs(USED_OTP_RETENTION_MINUTES);

    return {
      success: true,
      message: "OTP verified successfully.",
      userId: user.user_id,
    };
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return {
      success: false,
      message: "Failed to verify OTP.",
    };
  }
}

/**
 * Reset user password
 * @param {string} email - User's email
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Result object with success status and message
 */
async function resetPassword(email, newPassword) {
  try {
    // Get user by email
    const user = await checkUserExists(email);
    if (!user) {
      return { success: false, message: "Invalid request." };
    }

    // Hash new password
    const hashedPassword = crypto
      .createHash("sha256")
      .update(newPassword)
      .digest("hex");

    // Update password
    await query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      user.id,
    ]);

    return {
      success: true,
      message: "Password reset successfully.",
    };
  } catch (error) {
    console.error("Error resetting password:", error);
    return {
      success: false,
      message: "Failed to reset password.",
    };
  }
}

/**
 * Get OTP records for a user (for debugging/admin purposes)
 * @param {string} userId - User display ID from users.user_id
 * @param {string} purpose - Optional purpose filter
 * @returns {Promise<Array>} Array of OTP records
 */
async function getUserOTPs(userId, purpose = null) {
  try {
    let sql =
      "SELECT id, otp_code, purpose, expires_at, is_used, created_at FROM otp_codes WHERE user_id = ?";
    let params = [userId];

    if (purpose) {
      sql += " AND purpose = ?";
      params.push(purpose);
    }

    sql += " ORDER BY created_at DESC";

    const otps = await query(sql, params);
    return otps;
  } catch (error) {
    console.error("Error fetching user OTPs:", error);
    throw new Error("Failed to fetch OTP records");
  }
}

/**
 * Clean up expired OTPs (maintenance function)
 * Deletes expired OTPs and used OTPs older than the retention window.
 * @param {number} usedRetentionMinutes - Minutes to keep used OTP records
 * @returns {Promise<number>} Number of deleted records
 */
async function cleanupExpiredOTPs(
  usedRetentionMinutes = USED_OTP_RETENTION_MINUTES,
) {
  try {
    const result = await query(
      "DELETE FROM otp_codes WHERE expires_at < NOW() OR (is_used = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))",
      [true, usedRetentionMinutes],
    );
    return result.affectedRows;
  } catch (error) {
    console.error("Error cleaning up expired OTPs:", error);
    throw new Error("Failed to cleanup expired OTPs");
  }
}

module.exports = {
  generateOTP,
  checkUserExists,
  storeOTP,
  sendOTPEmail,
  sendOTP,
  verifyOTP,
  resetPassword,
  getUserOTPs,
  cleanupExpiredOTPs,
};
