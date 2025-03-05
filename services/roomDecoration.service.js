const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const RoomDecoration = require("../models/roomDecoration.schema");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");

const create = asyncErrorHandler(async (req, res) => {
  let createDaypass = await RoomDecoration.create(req.body);
  if (createDaypass) {
    AdminLogEvent(req.body.adminId,'None','Added New Room Decoration','Success',"Successfully Added New Room Decoration ("+createDaypass.title+") ",createDaypass._id)
    res.status(statusCode.accepted).json(createDaypass);
  } else {
    throw new ErrorResponse("Failed To Create Payment", 404);
  }
});

const update = asyncErrorHandler(async (req, res) => {
  let { title, price } = req.body;
  let findMassage = await RoomDecoration.findById(req.params.id);
  let updatedbody = {
    title: title ? title : findMassage.title,
    price: price ? price : findMassage.price,
  };
  let updateData = await RoomDecoration.findByIdAndUpdate(
    req.params.id,
    updatedbody
  );
  if (updateData) {
    AdminLogEvent(req.body.adminId,'None','Update Room Decoration','Success',"Successfully Updated Room Decoration ("+updateData.title+") ",updateData._id)
    res.status(statusCode.accepted).json(updateData);
  } else {
    throw new ErrorResponse("Failed To Update Massage", 404);
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  let allDaypass = await RoomDecoration.find({});
  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse("No Massage Found", 404);
  }
});

const del = asyncErrorHandler(async (req, res) => {
  let allDaypass = await RoomDecoration.findByIdAndDelete(req.params.id);
  if (allDaypass) {
    AdminLogEvent(req.body.adminId,'None','Delete Room Decoration','Success',"Successfully Deleted Room Decoration ("+allDaypass.title+") ",allDaypass._id)
    res.status(statusCode.accepted).json({ msg: "DELETED" });
  } else {
    throw new ErrorResponse("No Massage Found", 404);
  }
});

module.exports = { create, getAll, del, update };
