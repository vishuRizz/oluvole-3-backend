const express = require("express");
const {
  getPeakOffPriceSetting,
  setPeakOffPriceSetting,
  createPeakOffPriceSetting,
  deleteDateRange,
} = require("../services/settings.service");
const router = express.Router();

router.post("/create", createPeakOffPriceSetting);
router.get("/peak-off-price", getPeakOffPriceSetting);
router.post("/peak-off-price", setPeakOffPriceSetting);
router.delete("/peak-off-price/:index", deleteDateRange);

module.exports = router;
