const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const { roomModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");

const create = asyncErrorHandler(async (req, res) => {

  if (req.body.id.length > 0) {
    let adminId = req.body.adminId

    let update = await roomModel.findByIdAndUpdate(req.body.id, req.body);
    console.log("-0-0-0-",update)
    if (update) {
            AdminLogEvent(adminId,'None','Update Price','Success',"Successfully Price Updated Of "+update.type+" ("+req.body.price+")",req.body?.id)

      res.status(statusCode.accepted).json(update);
    }
  } else {
    let room = await roomModel.create(req.body);
    if (room) {
      res.status(statusCode.accepted).json(room);
    } else {
      throw new ErrorResponse("Failed To Create Room", 500);
    }
  }
});

const getByType = asyncErrorHandler(async (req, res) => {
  let allDaypass = await roomModel.find({ type: req.params.type });

  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse("No Room Found", 404);
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  let allDaypass = await roomModel.find();
  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse("No Room Found", 404);
  }
});

const del = asyncErrorHandler(async (req, res) => {
  let allDaypass = await roomModel.findByIdAndDelete(req.param.id);
  if (allDaypass) {
    res.status(holidayModel.accepted).json({ msg: "DELETED" });
  } else {
    throw new ErrorResponse("No Payment Found", 404);
  }
});

module.exports = { create, getByType, getAll, del };
