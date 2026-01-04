import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { upload, handleMulterError } from "../middleware/upload.middleware.js";
import {
  createCompany,
  getCompany,
  updateCompany,
  submitKYC,
  getKYC,
  getKYCDocument,
  getAllKYCSubmissions,
  viewKYCDocumentAdmin,
  getClientKYC,
  approveKYCDocument,
  rejectKYCDocument,
  markDocumentUnderReview,
} from "../controller/company.controller.js";

const router = express.Router();

router.post("/create", protectRoute, createCompany);

// ========== CLIENT KYC ENDPOINTS ==========
router.get("/getprofile", protectRoute, getCompany);
router.put("/editcompany", protectRoute, updateCompany);
router.post(
  "/kyc",
  protectRoute,
  upload.fields([
    { name: "crLicense", maxCount: 1 },
    { name: "vatCertificate", maxCount: 1 },
    { name: "signatoryId", maxCount: 1 },
    { name: "bankLetter", maxCount: 1 },
    { name: "proofOfAddress", maxCount: 1 },
    { name: "sourceOfFunds", maxCount: 1 },
  ]),
  handleMulterError,
  submitKYC
);
router.get("/kyc", protectRoute, getKYC);
router.get("/kyc/document/:documentType", protectRoute, getKYCDocument);

// ============ ADMIN SIDE =================
router.get("/kyc/admin/all", protectRoute, getAllKYCSubmissions);
router.get("/kyc/admin/:companyId", protectRoute, getClientKYC);
router.get(
  "/kyc/admin/:companyId/document/:documentType",
  protectRoute,
  viewKYCDocumentAdmin
);

router.put(
  "/kyc/admin/:companyId/:documentType/under-review",
  protectRoute,
  markDocumentUnderReview
);
router.put(
  "/kyc/admin/:companyId/approve/:documentType",
  protectRoute,
  approveKYCDocument
);
router.put(
  "/kyc/admin/:companyId/reject/:documentType",
  protectRoute,
  rejectKYCDocument
);
export default router;
