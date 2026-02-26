const mongoose = require("mongoose");

const newsletterSchema = mongoose.Schema(
    {
        subject: { type: String, required: true },
        body: { type: String, required: true },
        recipientCount: { type: Number, default: 0 },
        audienceType: { type: String, default: "all" },
        lookbackDays: { type: Number, default: null },
        status: {
            type: String,
            enum: ["draft", "sending", "sent", "failed"],
            default: "draft",
        },
        sentAt: { type: Date },
    },
    { timestamps: true }
);

const Newsletter = mongoose.model("Newsletter", newsletterSchema, "newsletters");

module.exports = { Newsletter };
