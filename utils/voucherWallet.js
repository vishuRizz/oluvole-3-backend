const { voucherModel } = require("../models");

const escapeRegex = (text = "") =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isVoucherActive = (voucher) => {
  if (!voucher) return false;
  const now = new Date();
  if (voucher.status && String(voucher.status).toLowerCase() !== "active") {
    return false;
  }
  if (voucher.startsAt && new Date(voucher.startsAt) > now) return false;
  if (voucher.expireAt && new Date(voucher.expireAt) < now) return false;
  return true;
};

const deductVoucherBalance = async ({ voucherCode, voucherUsed }) => {
  const code = String(voucherCode || "").trim().toUpperCase();
  const requestedAmount = Number(voucherUsed || 0);

  if (!code || requestedAmount <= 0) {
    return { deducted: false, deductedAmount: 0, reason: "invalid_input" };
  }

  const voucher = await voucherModel.findOne({
    code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
  });

  if (!voucher) {
    return { deducted: false, deductedAmount: 0, reason: "voucher_not_found" };
  }

  if (!isVoucherActive(voucher) || Number(voucher.balance || 0) <= 0) {
    return { deducted: false, deductedAmount: 0, reason: "voucher_inactive_or_empty" };
  }

  const currentBalance = Number(voucher.balance || 0);
  const deduction = Math.min(currentBalance, requestedAmount);
  if (deduction <= 0) {
    return { deducted: false, deductedAmount: 0, reason: "nothing_to_deduct" };
  }

  const updatedVoucher = await voucherModel.findOneAndUpdate(
    { _id: voucher._id },
    { $inc: { balance: -deduction } },
    { new: true }
  );

  return {
    deducted: true,
    deductedAmount: deduction,
    voucherId: voucher._id,
    voucherCode: voucher.code,
    remainingBalance: Number(updatedVoucher?.balance || 0),
  };
};

module.exports = {
  deductVoucherBalance,
};

