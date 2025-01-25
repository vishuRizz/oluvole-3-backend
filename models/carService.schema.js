const mongoose = require("mongoose");

const carServiceSchema = mongoose.Schema(
  {
    title: { type: String },
    price: { type: String },
    tripType: { type: String },
    carType: { type: String },
  },
  { timestamps: true }
);

const CarService = mongoose.model("CarService", carServiceSchema, "CarService");
module.exports = CarService;
