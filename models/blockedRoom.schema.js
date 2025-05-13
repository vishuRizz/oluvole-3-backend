const mongoose = require("mongoose");

const BlockedRoom = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
  },
  roomTitle: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  staffName: {
    type: String,
    required: true,
  },
  additionalInfo: {
    type: String,
    required: false,
  },
  arrivalDate: {
    type: Date,
    default: null,
    required: false,
  },
  departureDate: {
    type: Date,
    default: null,
    required: false,
  },
  group: {
    type: String,
    required: false,
  },
  rooms: {
    type: Number,
    required: false,
  },
  guestName: {
    type: String,
    required: false,
  },
  notes: {
    type: String,
    required: false,
  },
  guestEmail: {
    type: String,
    required: false,
  },
  guestPaymentAmount: {
    type: String,
    required: false,
  },
  guestPaymentMethod: {
    type: String,
    required: false,
  },
  
});
module.exports = mongoose.model("BlockedRoom", BlockedRoom);
