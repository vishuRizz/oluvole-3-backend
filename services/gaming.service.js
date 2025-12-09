const { asyncErrorHandler, ErrorResponse } = require("../middlewares/error/error");
const { gamingModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const { AdminLogEvent } = require("./adminLogs.service");

const create = asyncErrorHandler(async (req, res) => {
    let createGaming = await gamingModel.create(req.body)
    if (createGaming) {
        AdminLogEvent(req.body.adminId, 'None', 'Added New Gaming', 'Success', "Successfully Added New Gaming (" + createGaming.title + ") ", createGaming._id)
        res.status(statusCode.accepted).json(createGaming)
    }
    else {
        throw new ErrorResponse("Failed To Create Gaming", 404)
    }
})

const update = asyncErrorHandler(async (req, res) => {
    let { title, duration, price } = req.body
    let findGaming = await gamingModel.findById(req.params.id)
    let updatedbody = {
        title: title ? title : findGaming.title,
        duration: duration ? duration : findGaming.duration,
        price: price ? price : findGaming.price
    }
    let updateData = await gamingModel.findByIdAndUpdate(req.params.id, updatedbody)
    if (updateData) {
        AdminLogEvent(req.body.adminId, 'None', 'Update Gaming', 'Success', "Successfully Updated Gaming (" + updateData.title + ") ", updateData._id)
        res.status(statusCode.accepted).json(updateData)
    }
    else {
        throw new ErrorResponse("Failed To Update Gaming", 404)
    }
})

const getAll = asyncErrorHandler(async (req, res) => {
    let allGaming = await gamingModel.find({})
    res.status(statusCode.accepted).json(allGaming)
})

const del = asyncErrorHandler(async (req, res) => {
    let allGaming = await gamingModel.findByIdAndDelete(req.params.id)
    if (allGaming) { res.status(statusCode.accepted).json({ msg: "DELETED" }) }
    else { throw new ErrorResponse("No Gaming Found", 404) }
})

module.exports = { create, getAll, del, update } 