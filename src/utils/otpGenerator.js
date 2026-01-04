export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

export const generateOTPExpiry = () => {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
};
