const { asyncErrorHandler, ErrorResponse } = require("../middlewares/error/error");
const { termModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");


const create = asyncErrorHandler(async(req,res)=>{
    if(req.body.id.length>0){
        let adminId = req.body.adminId
        let update = await termModel.findByIdAndUpdate(req.body.id,req.body)
        if(update){
            AdminLogEvent(adminId,'None','Try To Update Term And condition','Success','Successfully Updated Terms And Condition',req.body?.id)
            res.status(statusCode.accepted).json(update)
        }
        else{
            throw new ErrorResponse("No Data Found",500)
        }

    }

    else{
        let createDaypass = await termModel.create(req.body)
        if(createDaypass){
            res.status(statusCode.accepted).json(createDaypass)
        }
        else{
            throw new ErrorResponse("No Data Found",500)
        }

    }
})

const getAll = asyncErrorHandler(async(req,res)=>{
    let allDaypass = await termModel.find({})
    if(allDaypass.length>0) {res.status(statusCode.accepted).json(allDaypass)}
    else {throw new ErrorResponse("No Payment Found",404)}
})


module.exports = { create, getAll}