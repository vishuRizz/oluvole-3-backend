const mongoose = require("mongoose");

const guestSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    gender: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    member: { type: Boolean, required: true },
    birthdayReminded: { type: Boolean, required: true },
    birthdayLastSentYear: { type: Number, default: null },
    photo: { type: String, default: "" },
    keepInfo: { type: Boolean, default: false },
    howDidYouFindUs: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    guests: { type: [mongoose.Schema.Types.Mixed], default: [] },

    visitMetrics: {
      dayVisits: { type: Number, default: 0 },
      overnightStays: { type: Number, default: 0 },
    },
    preferences: {
      dietaryRequirements: { type: [String], default: [] },
      drinkPreferences: { type: [String], default: [] },
      pastExtras: { type: [String], default: [] },
    },
    keyDates: {
      dob: { type: Date },
      anniversary: { type: Date },
    },

    // New fields for admin booking detail page
    preferredCommunicationChannel: { type: String, default: "" },
    guestPersona: { type: String, default: "" },
    specialOccasionNotes: { type: String, default: "" },
    theUsual: { type: String, default: "" },
    lastInteractionSummary: { type: String, default: "" },
  },
  { timestamps: true }
);

const Guest = mongoose.model("Guest", guestSchema, "Guest");
module.exports = Guest;
