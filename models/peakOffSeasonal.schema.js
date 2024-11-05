const mongoose = require("mongoose");

const PeakOffSeasonalSchema = new mongoose.Schema({
  isEnabled: { type: Boolean, default: false },
  percentage: { type: Number, default: 0 }, // Adjusted to match the range in the component
});

const PeakOffSeasonal = mongoose.model(
  "PeakOffSeasonal",
  PeakOffSeasonalSchema
);
module.exports = { PeakOffSeasonal };
