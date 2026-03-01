const { dayPassDiscountModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
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
  let staffInfo = await dayPassDiscountModel.create(payload);
  res.status(200).json(staffInfo);
});

const getAll = asyncErrorHandler(async (req, res) => {
  let voucher = await dayPassDiscountModel.find({});
  if (!voucher) {
    throw new ErrorResponse("No Discount", statusCode.notFound);
  } else {
    res.status(200).json(voucher);
  }
});

const deleteDiscount = asyncErrorHandler(async (req, res) => {
  let deletevoucher = await dayPassDiscountModel.findByIdAndDelete(
    req.params.id
  );
  if (!deletevoucher) {
    throw new ErrorResponse("Invalid Id", statusCode.notFound);
  } else {
    res.status(200).json({ msg: "Discount Deleted" });
  }
});
const validateDiscount = asyncErrorHandler(async (req, res) => {
  const code = normalizeCode(req.body.code || "");
  let discount = await dayPassDiscountModel.findOne({
    code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
  });
  if (!discount) {
    // Fallback for legacy records with accidental whitespace casing issues
    const allDiscounts = await dayPassDiscountModel.find({ code: { $exists: true, $ne: null } });
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

const getPaginated = asyncErrorHandler(async (req, res) => {
  const { paginate } = require("../utils/paginate");
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const result = await paginate(dayPassDiscountModel, {}, { page, limit });
  res.status(200).json(result);
});

module.exports = { createDiscount, getAll, deleteDiscount, validateDiscount, getPaginated };
