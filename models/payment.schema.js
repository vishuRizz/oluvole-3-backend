const mongoose = require("mongoose");

const paymentSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: String, required: true },
    status: { type: String, required: true },
    ref: { type: String, required: true },
    method: { type: String },
    guestDetails: { type: String },
    roomDetails: { type: String },
    bookingInfo: { type: String, required: false },
    subTotal: { type: String },
    vat: { type: String },
    totalCost: { type: String },
    discount: { type: Number },
    voucher: { type: Number },
    multiNightDiscount: { type: Number },
    previousCost: { type: Number, default: 0 },
    previousPaymentStatus: { type: String, default: "" },
    roomsPrice: { type: String, default: "" },
    extrasPrice: { type: String, default: "" },
    roomsDiscount: { type: String, default: "" },
    discountApplied: { type: String, default: "" },
    voucherApplied: { type: String, default: "" },
    voucherCode: { type: String, default: "" },
    voucherDeducted: { type: Boolean, default: false },
    voucherDeductedAmount: { type: Number, default: 0 },
    priceAfterVoucher: { type: String, default: "" },
    priceAfterDiscount: { type: String, default: "" },
  },
  { timestamps: true }
);

const Payment = mongoose.model("Payment", paymentSchema, "Payment");
module.exports = Payment;
