import mongoose from "mongoose";

const documentSchema = {
  fileUrl: String,
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "underReview"],
    default: "pending",
  },
};

const kycSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },

    documents: {
      crLicense: documentSchema,
      vatCertificate: documentSchema,
      signatoryId: documentSchema,
      bankLetter: documentSchema,
      proofOfAddress: documentSchema,
      sourceOfFunds: documentSchema,
    },

    overallStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "underReview"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("KYC", kycSchema);
