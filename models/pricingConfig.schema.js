const mongoose = require("mongoose");

const pricingConfigSchema = mongoose.Schema(
  {
    // ─── Daypass: Alcohol Package ────────────────────────────────────────────
    alcoholPackageRate: { type: Number, default: 45000 },

    // ─── Daypass: Palma / Plunge extras ─────────────────────────────────────
    palmaPlungeSingleRate: { type: Number, default: 10000 },  // per adult, either one
    palmaPlungeComboRate: { type: Number, default: 15000 },   // per adult, both selected

    // ─── Daypass: Multi-extras time-slot discount ────────────────────────────
    multiExtrasTimeSlotDiscountPercent: { type: Number, default: 20 },
    // Which time-slot label gets a half-price treatment
    timeSlotHalfPriceLabel: { type: String, default: "12noon - 2pm" },
    // Fraction to apply for that slot (0.5 = half price)
    timeSlotHalfPriceFraction: { type: Number, default: 0.5 },

    // ─── Daypass: Conference facility ────────────────────────────────────────
    conferenceHalfDayBase: { type: Number, default: 500000 },
    conferenceHalfDayPerGuest: { type: Number, default: 10000 },
    conferenceFullDayBase: { type: Number, default: 800000 },
    conferenceFullDayPerGuest: { type: Number, default: 15000 },
    conferenceExtraHourRate: { type: Number, default: 100000 },

    // ─── Tax / VAT ───────────────────────────────────────────────────────────
    vatPercent: { type: Number, default: 12.5 },

    // ─── Loyalty programme ───────────────────────────────────────────────────
    loyaltyNairaPerPoint: { type: Number, default: 10000 },   // ₦10,000 spend = 1 point
    loyaltyRedeemableThreshold: { type: Number, default: 50 }, // points needed to redeem

    // ─── Membership tiers (spend-based discounts) ────────────────────────────
    // Array of { name, minSpend, maxSpend, peakDiscount, offPeakDiscount }
    // maxSpend can be null to mean "no upper limit".
    membershipTiers: {
      type: [
        {
          name: { type: String, required: true },
          minSpend: { type: Number, required: true },
          maxSpend: { type: Number, default: null },
          peakDiscount: { type: Number, default: 0 },
          offPeakDiscount: { type: Number, default: 0 },
        },
      ],
      default: [
        {
          name: "Basic",
          minSpend: 0,
          maxSpend: 2000000,
          peakDiscount: 0,
          offPeakDiscount: 0,
        },
        {
          name: "Azure",
          minSpend: 2100000,
          maxSpend: 5000000,
          peakDiscount: 10,
          offPeakDiscount: 15,
        },
        {
          name: "Gold",
          minSpend: 5100000,
          maxSpend: null,
          peakDiscount: 15,
          offPeakDiscount: 20,
        },
      ],
    },

    // ─── Overnight: Child / toddler / infant multipliers (0–1) ───────────────
    overnightChildMultiplier: { type: Number, default: 0.5 },   // child = 50% of adult
    overnightToddlerMultiplier: { type: Number, default: 0.25 }, // toddler = 25% of adult
    overnightInfantMultiplier: { type: Number, default: 0 },     // infant = 0%

    // ─── Overnight: Additional guest discount tiers ──────────────────────────
    // Array of { threshold: number, percent: number } e.g. 30 guests → 5%, 40 → 10%
    overnightAdditionalGuestTiers: {
      type: [{ threshold: Number, percent: Number }],
      default: [
        { threshold: 30, percent: 5 },
        { threshold: 40, percent: 10 },
      ],
    },

    // ─── Overnight: Coupon discount (percentage off subtotal) ─────────────────
    overnightCouponDiscountPercent: { type: Number, default: 50 },
  },
  { timestamps: true }
);

const PricingConfig = mongoose.model("PricingConfig", pricingConfigSchema, "PricingConfig");
module.exports = PricingConfig;
