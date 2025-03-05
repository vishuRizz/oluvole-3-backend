const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const domesticStaffModel = require("../models/domesticStaff.schema");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");

const create = asyncErrorHandler(async (req, res) => {
  let createDaypass = await domesticStaffModel.create(req.body);
  if (createDaypass) {
    AdminLogEvent(req.body.adminId,'None','Added New Domestic Staff','Success',"Successfully Added New Domestic Staff ("+createDaypass.title+") ",createDaypass._id)
    res.status(statusCode.accepted).json(createDaypass);
  } else {
    throw new ErrorResponse("Failed To Create Payment", 404);
  }
});

const update = asyncErrorHandler(async (req, res) => {
  let { title, price } = req.body;
  let findMassage = await domesticStaffModel.findById(req.params.id);
  let updatedbody = {
    title: title ? title : findMassage.title,
    price: price ? price : findMassage.price,
  };
  let updateData = await domesticStaffModel.findByIdAndUpdate(
    req.params.id,
    updatedbody
  );
  if (updateData) {
    AdminLogEvent(req.body.adminId,'None','Update Domestic Staff','Success',"Successfully Updated Domestic Staff ("+updateData.title+") ",updateData._id)
    res.status(statusCode.accepted).json(updateData);
  } else {
    throw new ErrorResponse("Failed To Update Massage", 404);
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  let allDaypass = await domesticStaffModel.find({});
  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse("No Massage Found", 404);
  }
});

const del = asyncErrorHandler(async (req, res) => {
  let allDaypass = await domesticStaffModel.findByIdAndDelete(req.params.id);
  if (allDaypass) {
   AdminLogEvent(req.body.adminId,'None','Delete Domestic Staff','Success',"Successfully Deleted Domestic Staff ("+allDaypass.title+") ",allDaypass._id)
    res.status(statusCode.accepted).json({ msg: "DELETED" });
  } else {
    throw new ErrorResponse("No Massage Found", 404);
  }
});

module.exports = { create, getAll, del, update };
