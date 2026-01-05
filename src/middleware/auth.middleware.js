import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const protectRoute = async (req, res, next) => {
  try {
    // Check for token in cookies first, then Authorization header
    let token = req.cookies.accessToken;
    
    // If no cookie token, check Authorization header
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

// Authorize roles - restrict access to specific user roles
// export const authorizeRoles = (...roles) => {
//   return (req, res, next) => {
//     // Check if user exists (should be set by protectRoute)
//     if (!req.user) {
//       return res.status(401).json({ message: "User not authenticated" });
//     }

//     // Check if user's role is in the allowed roles
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({
//         message: `Access denied. ${req.user.role} role is not authorized to access this resource`,
//       });
//     }

//     next();
//   };
// };

// // Optional: Check if user owns the resource
// export const checkOwnership = (resourceField = "user") => {
//   return (req, res, next) => {
//     // This will be used in route handlers to verify ownership
//     // Example: Check if req.params.id matches req.user._id
//     req.checkOwnership = (resource) => {
//       return resource[resourceField].toString() === req.user._id.toString();
//     };
//     next();
//   };
// };
