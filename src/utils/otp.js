export function generateOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

export function otpExpiryDate(minutes) {
  const ms = minutes * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}


