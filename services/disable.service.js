const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const { disableModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");

const createOrUpdate = asyncErrorHandler(async (req, res) => {
  const { type, isDisabled } = req.body;
  try {
    const existingEntry = await disableModel.findOne({ type });
    if (existingEntry) {
      existingEntry.isDisabled = isDisabled;
      await existingEntry.save();
      AdminLogEvent(req.body.adminId,'None','Enable/Disable Extras','Success',"Successfully Enable Or Disable ("+existingEntry.type+") ","None")
      return res.status(statusCode.accepted).json(existingEntry);
    } else {
      const disableEntry = new disableModel({ type, isDisabled });
      const createdEntry = await disableEntry.save();
      AdminLogEvent(req.body.adminId,'None','Enable/Disable Extras','Success',"Successfully Enable Or Disable ("+createdEntry.type+") ","None")
      return res.status(statusCode.accepted).json(createdEntry);
    }
      AdminLogEvent(req.body.adminId,'None','Enable/Disable Extras','Success',"Successfully Enable Or Disable ("+type+") ","None")
  } catch (error) {
    console.error("Error in createOrUpdate:", error);
    throw new ErrorResponse("Failed to create or update entry", 500);
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
