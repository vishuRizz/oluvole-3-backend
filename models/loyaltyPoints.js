const mongoose = require("mongoose");

const LoyaltySchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  // currentSpent: { type: Number, default: 0 },
  redeemable: { type: Boolean, default: false },
});

const loyaltyCoinModel =  mongoose.model("LoyaltyPoints", LoyaltySchema);
module.exports = {loyaltyCoinModel};