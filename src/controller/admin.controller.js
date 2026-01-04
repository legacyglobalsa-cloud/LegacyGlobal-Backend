import KYC from "@/models/client/kyc.model";

export const reviewKYC = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    const { kycId } = req.params;
    const { documentKey, status } = req.body;

    const allowedDocs = [
      "crLicense",
      "vatCertificate",
      "signatoryId",
      "bankLetter",
      "proofOfAddress",
      "sourceOfFunds",
    ];

    if (!allowedDocs.includes(documentKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
      });
    }

    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC record not found",
      });
    }

    kyc.documents[documentKey].status = status;

    const allApproved = Object.values(kyc.documents).every(
      (doc) => doc.status === "approved"
    );

    kyc.overallStatus = allApproved ? "approved" : "underReview";

    await kyc.save();

    res.status(200).json({
      success: true,
      message: "KYC updated successfully",
      kyc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add this new controller function
export const viewKYCDocument = async (req, res) => {
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

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Update status to "underReview" when admin views it
    if (document.status === "pending") {
      await KYC.findOneAndUpdate(
        { company: companyId },
        {
          $set: {
            [`documents.${documentType}.status`]: "underReview",
            [`documents.${documentType}.viewedAt`]: new Date(),
          },
        }
      );
    }

    // Build and serve the file
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
