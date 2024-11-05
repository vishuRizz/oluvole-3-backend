const express = require("express");
const {
  createOrUpdatePeakOffSeasonalSetting,
  getPeakOffSeasonalSetting,
} = require("../services/peakOffSeasonal.service");
const router = express.Router();

router.post("/create", createOrUpdatePeakOffSeasonalSetting);
router.get("/get", getPeakOffSeasonalSetting);

module.exports = router;
