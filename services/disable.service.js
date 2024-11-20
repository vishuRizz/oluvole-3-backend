const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const { disableModel } = require("../models");
const { statusCode } = require("../utils/statusCode");

const createOrUpdate = asyncErrorHandler(async (req, res) => {
  const { type, isDisabled } = req.body;

  // Check if the entry already exists
  const existingEntry = await disableModel.findOne({ type });
  if (existingEntry) {
    // Update the existing entry
    existingEntry.isDisabled = isDisabled;
    await existingEntry.save();
    return res.status(statusCode.accepted).json(existingEntry);
  } else {
    // Create a new entry if it doesn't exist
    const disableEntry = new disableModel({ type, isDisabled });
    const createdEntry = await disableEntry.save();
    return res.status(statusCode.accepted).json(createdEntry);
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  const allDisabledExtras = await disableModel.find({});
  if (allDisabledExtras.length > 0) {
    res.status(statusCode.accepted).json(allDisabledExtras);
  } else {
    throw new ErrorResponse("No Disabled Extras Found", 404);
  }
});

const del = asyncErrorHandler(async (req, res) => {
  const deletedEntry = await disableModel.findByIdAndDelete(req.params.id);
  if (deletedEntry) {
    res.status(statusCode.accepted).json({ msg: "DELETED" });
  } else {
    throw new ErrorResponse("No Disabled Entry Found", 404);
  }
});

module.exports = { createOrUpdate, getAll, del };
