const { PeakOffSeasonal } = require("../models/peakOffSeasonal.schema");

const createOrUpdatePeakOffSeasonalSetting = async (req, res) => {
  const { isEnabled, percentage } = req.body;
  const setting = await PeakOffSeasonal.findOne();

  if (setting) {
    // Update existing setting
    setting.isEnabled = isEnabled;
    setting.percentage = percentage;
    await setting.save();
    return res
      .status(200)
      .json({ message: "Peak Off Seasonal setting updated successfully" });
  } else {
    // Create new setting
    const newSetting = new PeakOffSeasonal({ isEnabled, percentage });
    await newSetting.save();
    return res.status(201).json(newSetting);
  }
};

const getPeakOffSeasonalSetting = async (req, res) => {
  const setting = await PeakOffSeasonal.findOne();
  res.status(200).json(setting);
};

module.exports = {
  createOrUpdatePeakOffSeasonalSetting,
  getPeakOffSeasonalSetting,
};
