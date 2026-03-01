const { voucherModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");
const { paginate } = require("../utils/paginate");
const escapeRegex = (text = "") =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createVoucher = asyncErrorHandler(async (req, res) => {
  const payload = {
    ...req.body,
    code: String(req.body.code || "").trim().toUpperCase(),
    amount: Number(req.body.amount || 0),
    balance:
      req.body.balance === undefined || req.body.balance === null || req.body.balance === ""
        ? Number(req.body.amount || 0)
        : Number(req.body.balance),
  };

  let staffInfo = await voucherModel.create(payload);
  if (!staffInfo) {
    throw new ErrorResponse("Failed To Create Voucher", statusCode.badRequest);
  }
  res.status(200).json(staffInfo);
});

const getAll = asyncErrorHandler(async (req, res) => {
  let voucher = await voucherModel.find({});
  if (!voucher) {
    throw new ErrorResponse("No Voucher", statusCode.notFound);
  } else {
    res.status(200).json(voucher);
  }
});

const getPaginatedVouchers = asyncErrorHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paginate(voucherModel, {}, { page, limit });
  res.status(200).json(result);
});

const deleteVoucher = asyncErrorHandler(async (req, res) => {
  let deletevoucher = await voucherModel.findByIdAndDelete(req.params.id);
  if (!deletevoucher) {
    throw new ErrorResponse("Invalid Id", statusCode.notFound);
  } else {
    res.status(200).json({ msg: "Voucher Deleted" });
  }
});

const validateVoucher = asyncErrorHandler(async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const price = Number(req.body.price || 0);
  let voucher = await voucherModel.findOne({
    code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
  });
  if (!voucher) {
    throw new ErrorResponse("Invalid Voucher Code", statusCode.notFound);
  } else if (voucher.status && String(voucher.status).toLowerCase() !== "active") {
    throw new ErrorResponse("Voucher is not active", statusCode.badRequest);
  } else if (new Date(voucher.startsAt) > new Date()) {
    throw new ErrorResponse("Voucher is not valid yet", statusCode.badRequest);
  } else if (new Date(voucher.expireAt) < new Date()) {
    throw new ErrorResponse("Voucher has expired", statusCode.badRequest);
  } else if (voucher.balance <= 0) {
    throw new ErrorResponse(
      "Voucher has been fully used",
      statusCode.badRequest
    );
  } else {
    let newPrice = price;
    if (price >= voucher.balance) {
      newPrice = price - voucher.balance;
    } else if (price < voucher.balance) {
      newPrice = 0;
    }
    let remainingBalance = voucher.balance - price;
    if (remainingBalance < 0) {
      remainingBalance = 0;
    }

    res.status(200).json({
      voucher,
      newPrice,
      remainingBalance,
    });
  }
});

module.exports = { createVoucher, getAll, getPaginatedVouchers, deleteVoucher, validateVoucher };
