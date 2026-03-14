const mongoose = require("mongoose");

const SeasonalSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  // Optional per-date percentage hike for daypass pricing.
  // If omitted, frontend falls back to the global seasonal percentage.
  percentage: {
    type: Number,
    default: 0,
  },
});
module.exports = mongoose.model("Seasonal", SeasonalSchema);
