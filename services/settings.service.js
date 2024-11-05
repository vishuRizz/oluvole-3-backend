const { PeakOffPriceSchema } = require("../models/settings.schema");

const createPeakOffPriceSetting = async (req, res) => {
  const { isEnabled, dateRanges } = req.body;
  const peak = new PeakOffPriceSchema({ isEnabled, dateRanges });
  await peak.save();
  res.status(201).json(peak);
};

const getPeakOffPriceSetting = async (req, res) => {
  const setting = await PeakOffPriceSchema.findOne();
  res.status(200).json(setting);
};

const setPeakOffPriceSetting = async (req, res) => {
  const { isEnabled, dateRanges } = req.body;
  await PeakOffPriceSchema.findOneAndUpdate(
    {},
    { isEnabled, dateRanges },
    { upsert: true }
  );
  res.status(200).json({ message: "PeakOffPriceSchema updated successfully" });
};

const deleteDateRange = async (req, res) => {
  const { index } = req.params;
  const setting = await PeakOffPriceSchema.findOne();

  if (setting) {
    setting.dateRanges.splice(index, 1);
    await setting.save();
    res.status(200).json({ message: "Date range deleted successfully" });
  } else {
    res.status(404).json({ message: "Setting not found" });
  }
};

module.exports = {
  getPeakOffPriceSetting,
  setPeakOffPriceSetting,
  createPeakOffPriceSetting,
  deleteDateRange,
};
