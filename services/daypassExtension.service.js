const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const DaypassExtension = require("../models/daypassExtension.schema");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");

const create = asyncErrorHandler(async (req, res) => {
  let createDaypass = await DaypassExtension.create(req.body);
  if (createDaypass) {
    AdminLogEvent(req.body.adminId,'None','Added New Daypass Extension','Success',"Successfully Added New Daypass Extension ("+createDaypass.title+") ",createDaypass._id)
    res.status(statusCode.accepted).json(createDaypass);
  } else {
    throw new ErrorResponse("Failed To Create Daypass Extension", 404);
  }
});

const update = asyncErrorHandler(async (req, res) => {
  let { title, price } = req.body;
  let findMassage = await DaypassExtension.findById(req.params.id);
  let updatedbody = {
    title: title ? title : findMassage.title,
    price: price ? price : findMassage.price,
  };
  let updateData = await DaypassExtension.findByIdAndUpdate(
    req.params.id,
    updatedbody
  );
  if (updateData) {
    AdminLogEvent(req.body.adminId,'None','Update Daypass Extension','Success',"Successfully Updated Daypass Extension ("+updateData.title+") ",updateData._id)
    res.status(statusCode.accepted).json(updateData);
  } else {
    throw new ErrorResponse("Failed To Update Daypass Extension", 404);
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  let allDaypass = await DaypassExtension.find({});
  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse("No Daypass Extension Found", 404);
  }
});

const del = asyncErrorHandler(async (req, res) => {
  let allDaypass = await DaypassExtension.findByIdAndDelete(req.params.id);
  if (allDaypass) {
    AdminLogEvent(req.body.adminId,'None','Delete Daypass Extension','Success',"Successfully Deleted Daypass Extension ("+allDaypass.title+") ",allDaypass._id)
    res.status(statusCode.accepted).json({ msg: "DELETED" });
  } else {
    throw new ErrorResponse("No Daypass Extension Found", 404);
  }
});

module.exports = { create, getAll, del, update };
