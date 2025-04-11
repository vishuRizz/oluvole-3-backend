const mongoose = require("mongoose");

const ClubMemberSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  clubID: {
    type: String,
    required: true,
    unique: true,
  },
  validUntil: {
    type: Date,
    required: true,
  },
  active: { type: Boolean, default: true },
  lastRenewalReminder: {
    type: Date,
    default: null,
  }, // Track renewal reminders
  discountTier: {
    type: String,
    enum: ['standard'], // Single Tier (expandable)
    default: 'standard'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const clubMember = new mongoose.model(
  "ClubMember",
  ClubMemberSchema,
  "ClubMember"
);
module.exports = clubMember;
