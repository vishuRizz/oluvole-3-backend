const mongoose = require("mongoose");

const iconExtra = mongoose.Schema(
  {
    title: { type: String, required: true },
    price: { type: String, required: true },
    icon: { type: String, required: true },
    // type: {
    //   type: String,
    //   default: "iconExtra",
    // },
  },
  { timestamps: true }
);

const IconExtra = mongoose.model("IconExtra", iconExtra, "IconExtra");
module.exports = IconExtra;
