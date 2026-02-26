const mongoose = require("mongoose");

const overNightBookingSchema = mongoose.Schema(
  {
    totalGuest: { type: Object, required: true },
    bookingDetails: {
      type: Object,
      required: true,
      // Structure: { visitDate, endDate, roomAssignments: [{roomId, date, roomDetails}], selectedRooms, multiNightSelections }
    },
    guestDetails: { type: Object, required: true },
    shortId: {
      type: String,
      unique: true, // Ensure uniqueness
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Checked In", "Checked Out", "Cancelled"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

const daypassBookingSchema = mongoose.Schema(
  {
    totalGuest: { type: Object, required: true },
    bookingDetails: { type: Object, required: true },
    guestDetails: { type: Object, required: true },
    shortId: {
      type: String,
      unique: true, // Ensure uniqueness
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Checked In", "Checked Out", "Cancelled"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

const daypassBooking = mongoose.model(
  "daypassBooking",
  daypassBookingSchema,
  "daypassBooking"
);
const overnightBooking = mongoose.model(
  "overnightBooking",
  overNightBookingSchema,
  "overnightBooking"
);

module.exports = { overnightBooking, daypassBooking };
