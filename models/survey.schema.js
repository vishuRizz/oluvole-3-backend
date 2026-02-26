const mongoose = require("mongoose");

const surveySchema = mongoose.Schema(
    {
        bookingId: { type: String, required: true },
        guestEmail: { type: String, required: true },
        ratings: {
            staffProfessionalism: { type: Number, min: 0, max: 5, default: 0 },
            warmthOfGreeting: { type: Number, min: 0, max: 5, default: 0 },
            facilityCleanliness: { type: Number, min: 0, max: 5, default: 0 },
            applianceFunctionality: { type: Number, min: 0, max: 5, default: 0 },
            menuVariety: { type: Number, min: 0, max: 5, default: 0 },
            valueForMoney: { type: Number, min: 0, max: 5, default: 0 },
            safetyTranquility: { type: Number, min: 0, max: 5, default: 0 },
        },
        feedback: { type: String, default: "" },
        submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

const Survey = mongoose.model("Survey", surveySchema, "surveys");

module.exports = { Survey };
