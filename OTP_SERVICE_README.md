# OTP Service Documentation

## Overview

The OTP (One-Time Password) service handles all OTP-related operations for the CCS System, including password reset, login verification, and general user authentication.

## Features

- ✅ Email verification before sending OTP
- ✅ 6-digit OTP generation
- ✅ Secure database storage with expiration
- ✅ Email delivery via Gmail SMTP
- ✅ OTP verification with automatic expiration
- ✅ Password reset functionality
- ✅ Maintenance functions for cleanup

## File Structure

```
services/
├── otp_service.js          # Main OTP service file
├── supabase_config.js      # Supabase configuration
└── ...

electron/
├── main.js                 # IPC handlers using OTP service
└── preload.js             # API exposure

database/
├── dbconnect.js           # Database connection
└── ...

renderer/
├── modules/m1_archive/
│   └── forgotpass.html    # Frontend OTP interface
└── ...
```

## Database Table: otp_codes

```sql
CREATE TABLE otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose ENUM('login', 'reset_password', 'verification') DEFAULT 'verification',
    expires_at DATETIME NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Table Behavior

- **Valid OTP**: `is_used = FALSE` AND `expires_at > NOW()`
- **Expiration**: 10 minutes from creation
- **Single Use**: Once verified, marked as used
- **Cleanup**: Expired and used OTPs can be cleaned up

## API Functions

### Core Functions

#### `sendOTP(email, purpose)`

Sends an OTP to the specified email address.

**Parameters:**

- `email` (string): User's email address
- `purpose` (string): 'reset_password', 'login', or 'verification'

**Returns:**

```javascript
{
  success: true|false,
  message: "OTP sent successfully." | "No account found...",
  userId: 123 // only on success
}
```

#### `verifyOTP(email, otp, purpose)`

Verifies an OTP code.

**Parameters:**

- `email` (string): User's email address
- `otp` (string): 6-digit OTP code
- `purpose` (string): OTP purpose

**Returns:**

```javascript
{
  success: true|false,
  message: "OTP verified successfully." | "Invalid or expired OTP.",
  userId: 123 // only on success
}
```

#### `resetPassword(email, newPassword)`

Resets a user's password after OTP verification.

**Parameters:**

- `email` (string): User's email address
- `newPassword` (string): New password (will be hashed)

**Returns:**

```javascript
{
  success: true|false,
  message: "Password reset successfully." | "Failed to reset password."
}
```

### Utility Functions

#### `checkUserExists(email)`

Checks if a user exists with the given email.

**Parameters:**

- `email` (string): Email to check

**Returns:** User object or null

#### `generateOTP()`

Generates a random 6-digit OTP.

**Returns:** String (6 digits)

#### `storeOTP(userId, otp, purpose, expiresAt)`

Stores an OTP in the database.

**Parameters:**

- `userId` (number): User ID
- `otp` (string): OTP code
- `purpose` (string): OTP purpose
- `expiresAt` (Date): Optional expiration date

#### `sendOTPEmail(email, otp, purpose)`

Sends OTP via email (internal function).

#### `getUserOTPs(userId, purpose)`

Gets OTP records for a user (admin/debugging).

#### `cleanupExpiredOTPs()`

Removes expired and old used OTPs.

## Usage Examples

### Password Reset Flow

```javascript
// 1. Send OTP
const result = await sendOTP("user@example.com", "reset_password");
if (!result.success) {
  console.error(result.message);
  return;
}

// 2. Verify OTP
const verifyResult = await verifyOTP(
  "user@example.com",
  "123456",
  "reset_password",
);
if (!verifyResult.success) {
  console.error(verifyResult.message);
  return;
}

// 3. Reset Password
const resetResult = await resetPassword(
  "user@example.com",
  "newSecurePassword123",
);
console.log(resetResult.message);
```

### Login with OTP

```javascript
// Send login OTP
const result = await sendOTP("user@example.com", "login");

// Verify login OTP
const verifyResult = await verifyOTP("user@example.com", "123456", "login");
```

## Email Templates

The service includes different email templates for various purposes:

- **reset_password**: Password reset request
- **login**: Login verification
- **verification**: General verification

## Security Features

- ✅ OTP expiration (10 minutes)
- ✅ Single-use OTPs
- ✅ Email verification before sending
- ✅ Secure password hashing (SHA-256)
- ✅ Database foreign key constraints
- ✅ Automatic cleanup of expired OTPs

## Error Handling

All functions include comprehensive error handling:

- Database connection errors
- Email sending failures
- Invalid user accounts
- Expired/invalid OTPs
- Password validation

## Testing

Run the test file to verify functionality:

```bash
node test_otp_service.js
```

## Maintenance

### Regular Cleanup

Call `cleanupExpiredOTPs()` periodically to remove old OTP records:

```javascript
const deletedCount = await cleanupExpiredOTPs();
console.log(`Cleaned up ${deletedCount} expired OTPs`);
```

### Monitoring

Check OTP usage patterns and success rates for security monitoring.

## Dependencies

- `nodemailer`: Email sending
- `crypto`: Password hashing
- Database connection (`dbconnect.js`)

## Configuration

Email settings are configured in the service file:

- Gmail SMTP server
- Sender email: smartacademicbsit3b@gmail.com
- App password: uxwv qwii eymz phmj

## Notes

- OTPs expire after 10 minutes
- Only active users can receive OTPs
- Passwords are hashed using SHA-256 before storage
- Foreign key constraints ensure data integrity
- Multiple OTP requests per user are allowed
