import nodemailer from "nodemailer";

// Don't create transporter here - create it inside the function
export const sendOTPEmail = async (email, otp) => {
  // Create transporter when function is called (env vars are loaded by now)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  console.log("Sending email to:", email);
  console.log("Using:", process.env.EMAIL_USER);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Email Verification - OTP",
    html: `
      <h2>Your OTP Code</h2>
      <p>Your verification code is: <strong>${otp}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("Email sending failed:", error.message);
    throw error;
  }
};
