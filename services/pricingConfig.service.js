const PricingConfig = require("../models/pricingConfig.schema");
const { asyncErrorHandler } = require("../middlewares/error/error");

// Always work on a single document (upsert pattern).
const getConfig = asyncErrorHandler(async (req, res) => {
  let config = await PricingConfig.findOne();
  if (!config) {
    config = await PricingConfig.create({});
  }
  res.status(200).json(config);
});

const updateConfig = asyncErrorHandler(async (req, res) => {
  let config = await PricingConfig.findOne();
  if (!config) {
    config = await PricingConfig.create(req.body);
  } else {
    const allowed = [
      "alcoholPackageRate",
      "palmaPlungeSingleRate",
      "palmaPlungeComboRate",
      "multiExtrasTimeSlotDiscountPercent",
      "timeSlotHalfPriceLabel",
      "timeSlotHalfPriceFraction",
      "conferenceHalfDayBase",
      "conferenceHalfDayPerGuest",
      "conferenceFullDayBase",
      "conferenceFullDayPerGuest",
      "conferenceExtraHourRate",
      "vatPercent",
      "loyaltyNairaPerPoint",
      "loyaltyRedeemableThreshold",
      "overnightChildMultiplier",
      "overnightToddlerMultiplier",
      "overnightInfantMultiplier",
      "overnightAdditionalGuestTiers",
      "overnightCouponDiscountPercent",
      "membershipTiers",
    ];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        config[key] = req.body[key];
      }
    });
    await config.save();
  }
  res.status(200).json(config);
});

module.exports = { getConfig, updateConfig };
