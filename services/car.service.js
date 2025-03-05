const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const CarService = require("../models/carService.schema");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");

const create = asyncErrorHandler(async (req, res) => {
  let createDaypass = await CarService.create(req.body);
  if (createDaypass) {
    AdminLogEvent(req.body.adminId,'None','Added New Car Service','Success',"Successfully Added New Car Service ("+createDaypass.tripType+") ",createDaypass._id)
    res.status(statusCode.accepted).json(createDaypass);
  } else {
    throw new ErrorResponse("Failed To Create Payment", 404);
  }
});

const update = asyncErrorHandler(async (req, res) => {
  let { title, price, carType } = req.body;
  let findMassage = await CarService.findById(req.params.id);
  let updatedbody = {
    title: title ? title : findMassage.title,
    price: price ? price : findMassage.price,
    carType: carType ? carType : findMassage.carType,
  };
  let updateData = await CarService.findByIdAndUpdate(
    req.params.id,
    updatedbody
  );
  if (updateData) {
    AdminLogEvent(req.body.adminId,'None','Update Car Service','Success',"Successfully Updated Car Service ("+updateData.tripType+") ",updateData._id)
    res.status(statusCode.accepted).json(updateData);
  } else {
    throw new ErrorResponse("Failed To Update Massage", 404);
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  let allDaypass = await CarService.find({});
  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse("No Massage Found", 404);
  }
});

const del = asyncErrorHandler(async (req, res) => {
  let allDaypass = await CarService.findByIdAndDelete(req.params.id);
  if (allDaypass) {
    AdminLogEvent(req.body.adminId,'None','Delete Car Service','Success',"Successfully Deleted Car Service ("+allDaypass.tripType+") ",allDaypass._id)
    res.status(statusCode.accepted).json({ msg: "DELETED" });
  } else {
    throw new ErrorResponse("No Massage Found", 404);
  }
});

module.exports = { create, getAll, del, update };
