import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    companyName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
    },

    crNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    vatNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    address: {
      country: {
        type: String,
        required: true,
        trim: true,
      },
      city: {
        type: String,
        required: true,
        trim: true,
      },
      addressLine: {
        type: String,
        required: true,
        trim: true,
      },
    },

    //Authorized Signatory
    authorizedSignatory: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },
      passportNumber: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: [
          /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
          "Please provide a valid email address",
        ],
      },
      phone: {
        type: String,
        required: true,
        trim: true,
      },
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
  },

  {
    timestamps: true,
  }
);

export default mongoose.model("Company", companySchema);
