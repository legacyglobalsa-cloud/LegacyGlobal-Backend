import express from "express";
import {
  login,
  logout,
  refreshAccessToken,
  getrole,
  signup,
  verifyOTP,
  resendOTP,
  getProfile,
  socketToken,
} from "../controller/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-otp", verifyOTP);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);
router.post("/resend-otp", resendOTP);
router.get("/role", protectRoute, getrole);
router.get("/profile", protectRoute, getProfile);
router.get("/socket-token", protectRoute, socketToken);

export default router;
