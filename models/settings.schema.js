const mongoose = require("mongoose");

const DateRangeSchema = new mongoose.Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  percentage: { type: Number, min: -500, max: 500, required: true },
});

const PeakOffPriceSchemaSchema = new mongoose.Schema({
  isEnabled: { type: Boolean, default: false },
  dateRanges: [DateRangeSchema],
});

const PeakOffPriceSchema = mongoose.model(
  "PeakOffPriceSchema",
  PeakOffPriceSchemaSchema
);
module.exports = { PeakOffPriceSchema };
