import Company from "../models/client/client.model.js";
import KYC from "../models/client/kyc.model.js";
import User from "../models/user.model.js";
import { io } from "../../server.js";
import fs from "fs";
import path from "path";

export const createCompany = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({
        success: false,
        message: "Only clients can create a company profile",
      });
    }

    const userId = req.user._id;

    const existingCompany = await Company.findOne({ user: userId });
    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: "Company profile already exists",
      });
    }

    const {
      verificationStatus,
      verifiedBy,
      verifiedAt,
      rejectionReason,
      ...companyData
    } = req.body;

    const company = await Company.create({
      user: userId,
      companyName: companyData.companyName,
      category: companyData.category,
      crNumber: companyData.crNumber,
      vatNumber: companyData.vatNumber,
      address: companyData.address,
      authorizedSignatory: companyData.authorizedSignatory,
    });

    await User.findByIdAndUpdate(userId, {
      company: company._id,
    });

    console.log(`User ${userId} linked to company ${company._id}`);

    res.status(201).json({
      success: true,
      message: "Company profile created successfully",
      company,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} is already registered`,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCompany = async (req, res) => {
  try {
    const userId = req.user._id;

    const company = await Company.findOne({ user: userId })
      .select("-__v") // Exclude version key
      .lean(); // Faster query

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    res.status(200).json({
      success: true,
      company,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const userId = req.user._id;

    const {
      verificationStatus,
      verifiedBy,
      verifiedAt,
      rejectionReason,
      crNumber,
      vatNumber,
      user,
      ...updateData
    } = req.body;

    const company = await Company.findOneAndUpdate(
      { user: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .select("-__v")
      .lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    // ============================================================
    // SOCKET.IO - EMIT COMPANY PROFILE UPDATE
    // ============================================================
    if (req.io) {
      try {
        console.log("📡 [SOCKET] Emitting company:profile-updated to user:", userId.toString());
        req.io.to(userId.toString()).emit("company:profile-updated", {
          message: "Your company profile has been updated",
          companyId: company._id,
          companyName: company.companyName,
        });
        console.log("✅ [SOCKET] company:profile-updated event emitted");
      } catch (socketError) {
        console.error("❌ [SOCKET] Error during emission:", socketError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Company profile updated successfully",
      company,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const submitKYC = async (req, res) => {
  console.log("═══════════════════════════════════════");
  console.log("🔵 [SUBMIT KYC] === START ===");
  console.log("👤 [SUBMIT KYC] User:", req.user._id, "Role:", req.user.role);
  console.log("⏰ [SUBMIT KYC] Timestamp:", new Date().toISOString());
  console.log("═══════════════════════════════════════");

  try {
    if (req.user.role !== "client") {
      console.log("❌ [SUBMIT KYC] Not a client, rejecting");
      return res.status(403).json({
        success: false,
        message: "Only clients can submit KYC documents",
      });
    }

    const company = await Company.findOne({ user: req.user._id });
    if (!company) {
      console.log("❌ [SUBMIT KYC] Company not found for user:", req.user._id);
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    console.log(
      "✅ [SUBMIT KYC] Company found:",
      company._id,
      company.companyName
    );

    const files = req.files || {};

    if (Object.keys(files).length === 0) {
      console.log("❌ [SUBMIT KYC] No files uploaded");
      return res.status(400).json({
        success: false,
        message: "No documents uploaded",
      });
    }

    console.log("📁 [SUBMIT KYC] Files received:", Object.keys(files));

    const getFile = (name) => {
      if (files[name]?.[0]?.path) {
        const absolutePath = files[name][0].path;
        const relativePath = absolutePath
          .replace(/\\/g, "/")
          .split("uploads/")[1];

        return {
          fileUrl: `uploads/${relativePath}`,
          status: "pending",
        };
      }
      return undefined;
    };

    const documentUpdates = {};
    const uploadedDocs = [];

    [
      "crLicense",
      "vatCertificate",
      "signatoryId",
      "bankLetter",
      "proofOfAddress",
      "sourceOfFunds",
    ].forEach((docName) => {
      const file = getFile(docName);
      if (file) {
        documentUpdates[`documents.${docName}`] = file;
        uploadedDocs.push(docName);
        console.log(`✅ [SUBMIT KYC] Document ${docName} prepared for upload`);
      }
    });

    console.log(
      "📤 [SUBMIT KYC] Total documents to upload:",
      uploadedDocs.length
    );
    console.log("📤 [SUBMIT KYC] Document types:", uploadedDocs);

    const kyc = await KYC.findOneAndUpdate(
      { company: company._id },
      {
        $set: documentUpdates,
        $setOnInsert: {
          company: company._id,
          overallStatus: "pending",
        },
      },
      { new: true, upsert: true }
    );

    console.log("✅ [SUBMIT KYC] KYC updated in database");

    // ═══════════════════════════════════════
    // SOCKET.IO EMISSION
    // ═══════════════════════════════════════

    console.log("🔌 [SOCKET] === STARTING SOCKET EMISSION ===");

    if (!req.io) {
      console.error("❌ [SOCKET] CRITICAL ERROR: req.io is undefined!");
      console.error("❌ [SOCKET] Socket.IO was not attached to request object");
      // Don't fail the request, but log the error
    } else {
      console.log("✅ [SOCKET] req.io exists");

      // Prepare socket data
      const socketData = {
        companyId: company._id.toString(),
        companyName: company.companyName,
        documents: uploadedDocs,
        message: `${company.companyName} uploaded ${uploadedDocs.length} document(s)`,
        timestamp: new Date().toISOString(),
      };

      console.log(
        "📦 [SOCKET] Prepared data:",
        JSON.stringify(socketData, null, 2)
      );

      try {
        // Check connected sockets
        const allSockets = await req.io.fetchSockets();
        console.log("📊 [SOCKET] Total connected sockets:", allSockets.length);

        const adminSockets = allSockets.filter((s) =>
          Array.from(s.rooms).includes("admins")
        );
        console.log(
          "📊 [SOCKET] Admins in 'admins' room:",
          adminSockets.length
        );

        if (adminSockets.length > 0) {
          console.log("👥 [SOCKET] Admin details:");
          adminSockets.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.user?.email} (${s.id})`);
          });
        } else {
          console.warn("⚠️ [SOCKET] WARNING: No admins currently connected!");
        }

        // Emit to admins room
        console.log(
          "📡 [SOCKET] Emitting 'kyc:document-uploaded' to 'admins' room..."
        );
        req.io.to("admins").emit("kyc:document-uploaded", socketData);
        console.log("✅ [SOCKET] Event emitted to 'admins' room");

        // Also broadcast to all (backup)
        console.log("📡 [SOCKET] Broadcasting to all connected clients...");
        req.io.emit("kyc:document-uploaded", socketData);
        console.log("✅ [SOCKET] Event broadcast to all clients");

        console.log("🎉 [SOCKET] === SOCKET EMISSION COMPLETE ===");
      } catch (socketError) {
        console.error("❌ [SOCKET] Error during emission:", socketError);
        console.error("❌ [SOCKET] Stack:", socketError.stack);
      }
    }

    console.log("═══════════════════════════════════════");
    console.log("✅ [SUBMIT KYC] === SUCCESS ===");
    console.log("✅ [SUBMIT KYC] Sending response to client");
    console.log("═══════════════════════════════════════");

    res.status(200).json({
      success: true,
      message: "KYC submitted successfully",
      kyc,
    });
  } catch (error) {
    console.error("═══════════════════════════════════════");
    console.error("❌ [SUBMIT KYC] === ERROR ===");
    console.error("❌ [SUBMIT KYC] Error message:", error.message);
    console.error("❌ [SUBMIT KYC] Stack trace:", error.stack);
    console.error("═══════════════════════════════════════");

    if (req.files) {
      Object.values(req.files)
        .flat()
        .forEach((file) => {
          fs.unlink(file.path, (err) => {
            if (err) console.error(`Failed to delete file: ${file.path}`);
          });
        });
    }

    res.status(500).json({
      success: false,
      message: "Failed to submit KYC documents",
    });
  }
};

export const getKYC = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({
        success: false,
        message: "Only clients can view KYC documents",
      });
    }

    const company = await Company.findOne({ user: req.user._id });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    const kyc = await KYC.findOne({ company: company._id });

    if (!kyc) {
      // No KYC submitted yet, return empty structure
      return res.status(200).json({
        success: true,
        kyc: null,
      });
    }

    res.status(200).json({
      success: true,
      kyc,
    });
  } catch (error) {
    console.error("Get KYC error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch KYC documents",
    });
  }
};

export const getKYCDocument = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({
        success: false,
        message: "Only clients can view their KYC documents",
      });
    }

    const { documentType } = req.params; // crLicense, vatCertificate, etc.

    // Find user's company
    const company = await Company.findOne({ user: req.user._id });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company profile not found",
      });
    }

    // Get KYC record
    const kyc = await KYC.findOne({ company: company._id });
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "No KYC documents found",
      });
    }

    // Get specific document
    const document = kyc.documents[documentType];
    if (!document || !document.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Build full path from relative path
    const filePath = path.join(process.cwd(), document.fileUrl);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    // Get file extension for content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    // Set headers
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(filePath)}"`
    );

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve document",
    });
  }
};

// ============= ADMIN ENDPOINT ==========
export const viewKYCDocumentAdmin = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can view KYC documents",
      });
    }

    const { companyId, documentType } = req.params;

    const kyc = await KYC.findOne({ company: companyId });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC not found",
      });
    }

    const document = kyc.documents[documentType];

    if (!document || !document.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    //  Update status to "underReview" when admin views it for the first time
    if (document.status === "pending") {
      await KYC.findOneAndUpdate(
        { company: companyId },
        {
          $set: {
            [`documents.${documentType}.status`]: "underReview",
            [`documents.${documentType}.viewedAt`]: new Date(),
            [`documents.${documentType}.viewedBy`]: req.user._id,
          },
        }
      );
    }

    // Build full path from relative path
    const filePath = path.join(process.cwd(), document.fileUrl);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(filePath)}"`
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("View document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to view document",
    });
  }
};

export const getAllKYCSubmissions = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can view all KYC submissions",
      });
    }

    const kycSubmissions = await KYC.find()
      .populate({
        path: "company",
        select: "companyName category crNumber vatNumber address authorizedSignatory",
        populate: {
          path: "user",
          select: "fullname email",
        },
      })
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      submissions: kycSubmissions,
    });
  } catch (error) {
    console.error("Get all KYC error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch KYC submissions",
    });
  }
};

export const getClientKYC = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can view client KYC",
      });
    }

    const { companyId } = req.params;

    const kyc = await KYC.findOne({ company: companyId }).populate({
      path: "company",
      select:
        "companyName category crNumber vatNumber address authorizedSignatory",
      populate: {
        path: "user",
        select: "fullname email",
      },
    });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC not found for this company",
      });
    }

    res.status(200).json({
      success: true,
      kyc,
    });
  } catch (error) {
    console.error("Get client KYC error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch client KYC",
    });
  }
};

export const markDocumentUnderReview = async (req, res) => {
  const { companyId, documentType } = req.params;

  const kyc = await KYC.findOne({ company: companyId });
  if (!kyc || !kyc.documents[documentType]) {
    return res.status(404).json({ message: "Document not found" });
  }

  if (kyc.documents[documentType].status === "pending") {
    kyc.documents[documentType].status = "underReview";
    kyc.documents[documentType].reviewedAt = new Date();
    await kyc.save();
  }

  req.io.to(companyId).emit("kyc:document-under-review", {
    documentType,
    status: "underReview",
  });

  res.json({ success: true });
};

// Approve KYC document
export const approveKYCDocument = async (req, res) => {
  const startTime = Date.now();
  const { companyId, documentType } = req.params;

  console.log("[APPROVE DOC] START", { companyId, documentType });

  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can approve KYC documents",
      });
    }

    const kyc = await KYC.findOneAndUpdate(
      { company: companyId },
      {
        $set: {
          [`documents.${documentType}.status`]: "approved",
          [`documents.${documentType}.reviewedAt`]: new Date(),
          [`documents.${documentType}.reviewedBy`]: req.user._id,
        },
      },
      { new: true }
    ).populate({
      path: "company",
      populate: {
        path: "user",
        select: "_id",
      },
    });

    if (!kyc || !kyc.company || !kyc.company.user) {
      return res.status(404).json({
        success: false,
        message: "KYC or associated user not found",
      });
    }

    const clientUserId = kyc.company.user._id.toString();

    req.io.to(clientUserId).emit("kyc:document-approved", {
      companyId: companyId,
      documentType,
      status: "approved",
      message: `Your ${documentType} has been approved`,
    });

    console.log(` [APPROVE DOC] SUCCESS - ${Date.now() - startTime}ms`);

    // Only send response once
    res.status(200).json({
      success: true,
      message: "Document approved successfully",
      kyc,
    });
  } catch (error) {
    console.error(`[APPROVE DOC] ERROR:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to approve document",
    });
  }
};

//Reject KYC document
export const rejectKYCDocument = async (req, res) => {
  const startTime = Date.now();
  const { companyId, documentType } = req.params;
  const { reason } = req.body;

  console.log("[REJECT DOC] START", { companyId, documentType });

  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can reject KYC documents",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const kyc = await KYC.findOneAndUpdate(
      { company: companyId },
      {
        $set: {
          [`documents.${documentType}.status`]: "rejected",
          [`documents.${documentType}.rejectionReason`]: reason,
          [`documents.${documentType}.reviewedAt`]: new Date(),
          [`documents.${documentType}.reviewedBy`]: req.user._id,
        },
      },
      { new: true }
    ).populate({
      path: "company",
      select: "user",
    });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC not found",
      });
    }

    // Emit Socket.IO event to the CLIENT's user room
    const clientUserId = kyc.company.user.toString();
    console.log("[SOCKET] Emitting rejection to user room:", clientUserId);

    req.io.to(clientUserId).emit("kyc:document-rejected", {
      companyId: companyId,
      documentType,
      status: "rejected",
      reason,
      message: `Your ${documentType} has been rejected`,
    });

    console.log(`[REJECT DOC] SUCCESS - ${Date.now() - startTime}ms`);

    // Only send response once
    res.status(200).json({
      success: true,
      message: "Document rejected successfully",
      kyc,
    });
  } catch (error) {
    console.error(`[REJECT DOC] ERROR:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to reject document",
    });
  }
};
