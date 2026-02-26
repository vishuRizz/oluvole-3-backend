const mongoose = require("mongoose");

const retreatDaypassOptionSchema = mongoose.Schema(
    {
        adultsAlcoholic: {
            weekDayPrice: { type: Number, required: true },
            weekendPrice: { type: Number, required: true },
            seasonalPrice: { type: Number, required: true },
        },
        adultsNonAlcoholic: {
            weekDayPrice: { type: Number, required: true },
            weekendPrice: { type: Number, required: true },
            seasonalPrice: { type: Number, required: true },
        },
        nanny: {
            weekDayPrice: { type: Number, required: true },
            weekendPrice: { type: Number, required: true },
            seasonalPrice: { type: Number, required: true },
        },
        childTotal: {
            weekDayPrice: { type: Number, required: true },
            weekendPrice: { type: Number, required: true },
            seasonalPrice: { type: Number, required: true },
        },
    },
    { timestamps: true }
);

const RetreatDaypassOption = mongoose.model("RetreatDaypassOption", retreatDaypassOptionSchema);
module.exports = RetreatDaypassOption;
