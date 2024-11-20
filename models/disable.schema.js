const mongoose = require("mongoose");

const disableSchema = mongoose.Schema(
  {
    type: { type: String, required: true },
    isDisabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Disable = mongoose.model("Disable", disableSchema, "Disable");
module.exports = Disable;
