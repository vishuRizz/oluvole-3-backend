const mongoose = require("mongoose");

const gamingSchema = mongoose.Schema(
  {
    title: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true },
  },
  { timestamps: true }
);

const Gaming = mongoose.model("Gaming", gamingSchema, "Gaming");
module.exports = Gaming; 