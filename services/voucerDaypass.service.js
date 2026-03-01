const { dayPassVouherModel, voucherModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const { AdminLogEvent } = require("./adminLogs.service");
const escapeRegex = (text = "") =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");

const normalizeCode = (value = "") => String(value).trim().toUpperCase();

const findVoucherByNormalizedCode = async (model, code) => {
  const directMatch = await model.findOne({
    code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
  });
  if (directMatch) return directMatch;

  const allVouchers = await model.find({ code: { $exists: true, $ne: null } });
  return allVouchers.find((item) => normalizeCode(item.code) === code) || null;
};

const createDiscount = asyncErrorHandler(async (req, res) => {
  const payload = {
    ...req.body,
    code: normalizeCode(req.body.code || ""),
    amount: Number(req.body.amount || 0),
    balance:
      req.body.balance === undefined || req.body.balance === null || req.body.balance === ""
        ? Number(req.body.amount || 0)
        : Number(req.body.balance),
  };

  let staffInfo = await dayPassVouherModel.create(payload);
  AdminLogEvent(req.body.adminId, 'None', 'Added New Day Pass Vouchers', 'Success', "Successfully Added New Day Pass Vouchers (" + staffInfo.code + ") ", staffInfo._id)
  res.status(200).json(staffInfo);
});

const getAll = asyncErrorHandler(async (req, res) => {
  let voucher = await dayPassVouherModel.find({});
  if (!voucher) {
    throw new ErrorResponse("No Discount", statusCode.notFound);
  } else {
    res.status(200).json(voucher);
  }
});

const deleteDiscount = asyncErrorHandler(async (req, res) => {
  let deletevoucher = await dayPassVouherModel.findByIdAndDelete(req.params.id);
  if (!deletevoucher) {
    throw new ErrorResponse("Invalid Id", statusCode.notFound);
  } else {
    AdminLogEvent(req.body.adminId, 'None', 'Delete Day Pass Vouchers', 'Success', "Successfully Deleted Day Pass Vouchers (" + deletevoucher.code + ") ", 'None')
    res.status(200).json({ msg: "Discount Deleted" });
  }
});

const validateVoucher = asyncErrorHandler(async (req, res) => {
  const code = normalizeCode(req.body.code || "");
  const price = Number(req.body.price || 0);
  let voucher = await findVoucherByNormalizedCode(dayPassVouherModel, code);
  if (!voucher) {
    voucher = await findVoucherByNormalizedCode(voucherModel, code);
  }
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

const getPaginated = asyncErrorHandler(async (req, res) => {
  const { paginate } = require("../utils/paginate");
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const result = await paginate(dayPassVouherModel, {}, { page, limit });
  res.status(200).json(result);
});

module.exports = { createDiscount, getAll, deleteDiscount, validateVoucher, getPaginated };
