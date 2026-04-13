const {
  checkUserExists,
  generateOTP,
  storeOTP,
  sendOTP,
  verifyOTP,
  resetPassword,
  getUserOTPs,
  cleanupExpiredOTPs,
} = require("./services/otp_service");

// Test functions
async function testOTPService() {
  console.log("🧪 Testing OTP Service Functions...\n");

  try {
    // Test 1: Check if user exists
    console.log("1. Testing checkUserExists function...");
    const testEmail = "test@example.com"; // Replace with a real email from your database for testing
    const user = await checkUserExists(testEmail);
    console.log("   User exists:", user ? "YES" : "NO");
    if (user) {
      console.log("   User details:", {
        id: user.id,
        name: user.name,
        email: user.email,
      });
    }
    console.log("");

    // Test 2: Generate OTP
    console.log("2. Testing generateOTP function...");
    const otp = generateOTP();
    console.log("   Generated OTP:", otp, "(length:", otp.length, ")");
    console.log("");

    // Test 3: Store OTP (only if user exists)
    if (user) {
      console.log("3. Testing storeOTP function...");
      const otpId = await storeOTP(user.id, otp, "test_purpose");
      console.log("   OTP stored with ID:", otpId);
      console.log("");

      // Test 4: Get user OTPs
      console.log("4. Testing getUserOTPs function...");
      const userOtps = await getUserOTPs(user.id);
      console.log("   User OTPs count:", userOtps.length);
      if (userOtps.length > 0) {
        console.log("   Latest OTP:", {
          id: userOtps[0].id,
          code: userOtps[0].otp_code,
          purpose: userOtps[0].purpose,
          expires: userOtps[0].expires_at,
          used: userOtps[0].is_used,
        });
      }
      console.log("");
    }

    // Test 5: Cleanup expired OTPs
    console.log("5. Testing cleanupExpiredOTPs function...");
    const deletedCount = await cleanupExpiredOTPs();
    console.log("   Deleted expired OTPs:", deletedCount);
    console.log("");

    console.log("✅ OTP Service tests completed successfully!");
  } catch (error) {
    console.error("❌ Error during testing:", error.message);
    console.error("   Full error:", error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testOTPService();
}

module.exports = { testOTPService };
