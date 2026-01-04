import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { generateOTP, generateOTPExpiry } from "../utils/otpGenerator.js";
import { sendOTPEmail } from "../utils/emailService.js";

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId: userId },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "30m",
    }
  );

  const refreshToken = jwt.sign(
    { userId: userId },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );

  return { accessToken, refreshToken };
};

const setCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    //  Generate new tokens and set cookies
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      user._id
    );
    setCookies(res, accessToken, newRefreshToken);

    res.status(200).json({ success: true, message: "Token refreshed" });
  } catch (error) {
    res.clearCookie("refreshToken");
    res.clearCookie("accessToken");
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

export const signup = async (req, res) => {
  const { fullname, phone, email, password, confirmpassword } = req.body;

  try {
    // Validation checks
    if (!fullname || !phone || !email || !password || !confirmpassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password !== confirmpassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false, //  Added for consistency
        message: "User already exists",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = generateOTPExpiry();

    // Create user
    const user = await User.create({
      fullname,
      phone,
      email,
      password,
      otp,
      otpExpiry,
      isVerified: false,
    });

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.status(201).json({
      success: true, //  Added for consistency
      message: "User created. Please verify your email with the OTP sent.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Signup error:", error); //  Better logging
    res.status(500).json({
      success: false, //  Added for consistency
      message: "Internal server error", //  Don't expose error details
    });
  }
};

export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Check if OTP exists
    if (!user.otp || !user.otpExpiry) {
      return res
        .status(400)
        .json({ message: "No OTP found. Please request a new one." });
    }

    // Check expiry first
    if (new Date() > user.otpExpiry) {
      return res
        .status(400)
        .json({ message: "OTP expired. Please request a new one." });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Verify user and remove OTP fields
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // NOW generate tokens after verification
    const { accessToken, refreshToken } = generateTokens(user._id);
    setCookies(res, accessToken, refreshToken);

    res.status(200).json({
      message: "Email verified successfully",
      user: {
        _id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    // req.user is set by protectRoute middleware
    const user = await User.findById(req.user._id).select("fullname email");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user: {
        fullname: user.fullname,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error in getProfile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const user = await User.findOne({ email: email });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email before logging in",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Password" });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    setCookies(res, accessToken, refreshToken);

    res.status(200).json({
      success: true,
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ success: false, message: "Internal server Error" });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User already verified",
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = generateOTPExpiry();

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getrole = async (req, res) => {
  res.status(200).json({
    user: {
      _id: req.user._id,
      email: req.user.email,
      role: req.user.role,
    },
  });
};

export const socketToken = async (req, res) => {
  try {
    // Create a token specifically for Socket.IO
    const socketToken = jwt.sign(
      { userId: req.user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      token: socketToken,
    });
  } catch (error) {
    console.error("Socket token error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate socket token",
    });
  }
};
