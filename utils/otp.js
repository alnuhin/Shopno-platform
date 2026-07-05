// utils/otp.js
// -----------------------------------------------------------------------
// HONESTY NOTE FOR YOU (the developer): this prototype does NOT connect to
// a real SMS gateway. There is no working SSL/SMS/email-OTP delivery here
// because that requires a paid provider account (e.g. a Bangladeshi SMS
// gateway like SSL Wireless/Alpha SMS, or an email service like SendGrid)
// and real credentials which only you can create.
//
// What this DOES do, so your demo still works end-to-end:
//   - generates a real random 6-digit OTP
//   - stores it + an expiry time in the database
//   - shows it directly on the confirmation screen with a clear
//     "(DEMO MODE)" label, so you can test the whole flow yourself
//
// When you are ready to go live, replace `deliverOtp()` below with a call
// to your chosen SMS/email provider's API and remove the on-screen OTP.
// -----------------------------------------------------------------------

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpExpiry(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isOtpExpired(expiresAtIso) {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() < Date.now();
}

/**
 * Stand-in for a real delivery channel. In demo mode we simply log it and
 * return it so the calling route can flash it to the screen.
 */
function deliverOtp(destination, code) {
  console.log(`[DEMO OTP] Would send OTP ${code} to ${destination}`);
  return { delivered: false, demo: true, code };
}

module.exports = { generateOtp, otpExpiry, isOtpExpired, deliverOtp };
