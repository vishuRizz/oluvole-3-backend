const { discountModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const { AdminLogEvent } = require("./adminLogs.service");
const { paginate } = require("../utils/paginate");
const escapeRegex = (text = "") =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeCode = (value = "") => String(value).trim().toUpperCase();

const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");

const createDiscount = asyncErrorHandler(async (req, res) => {
  const payload = {
    ...req.body,
    code: normalizeCode(req.body.code || ""),
  };
  let staffInfo = await discountModel.create(payload);
  AdminLogEvent(req.body.adminId, 'None', 'Added New Discount', 'Success', "Successfully Added New Discount (" + staffInfo.code + ") ", staffInfo._id)
  res.status(200).json(staffInfo);
});

const getAll = asyncErrorHandler(async (req, res) => {
  let voucher = await discountModel.find({});
  if (!voucher) {
    throw new ErrorResponse("No Discount", statusCode.notFound);
  } else {
    res.status(200).json(voucher);
  }
});

const getPaginatedDiscounts = asyncErrorHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paginate(discountModel, {}, { page, limit });
  res.status(200).json(result);
});

const deleteDiscount = asyncErrorHandler(async (req, res) => {
  let deletevoucher = await discountModel.findByIdAndDelete(req.params.id);
  if (!deletevoucher) {
    throw new ErrorResponse("Invalid Id", statusCode.notFound);
  } else {
    res.status(200).json({ msg: "Discount Deleted" });
  }
});

const validateDiscount = asyncErrorHandler(async (req, res) => {
  const code = normalizeCode(req.body.code || "");
  let discount = await discountModel.findOne({
    code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
  });
  if (!discount) {
    // Fallback for legacy records with accidental whitespace casing issues
    const allDiscounts = await discountModel.find({ code: { $exists: true, $ne: null } });
    discount = allDiscounts.find((item) => normalizeCode(item.code) === code) || null;
  }
  if (!discount) {
    throw new ErrorResponse("Invalid Discount Code", statusCode.notFound);
  } else if (new Date(discount.expires) < new Date()) {
    throw new ErrorResponse("Discount has expired", statusCode.badRequest);
  } else {
    res.status(200).json(discount);
  }
});

module.exports = { createDiscount, getAll, getPaginatedDiscounts, deleteDiscount, validateDiscount };
