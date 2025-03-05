const { asyncErrorHandler, ErrorResponse } = require("../middlewares/error/error");
const { cakeModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const {AdminLogEvent} = require("./adminLogs.service");


const create = asyncErrorHandler(async(req,res)=>{
    let createCake = await cakeModel.create(req.body)
    if(createCake){
        AdminLogEvent(req.body.adminId,'None','Added New Cake','Success',"Successfully Added New Cake ("+createCake.title+") ",createCake._id)
        res.status(statusCode.accepted).json(createCake)
    }
    else{
        AdminLogEvent(req.body.adminId,'None','Added New Cake','Failed',"Failed To Create Cake ","None")
        throw new ErrorResponse("Failed To Create Cake",404)
    }
})

const update = asyncErrorHandler(async(req,res)=>{

    let {title,desc,price} = req.body
    let findCake = await cakeModel.findById(req.params.id)
    let updatedbody = {
        title:title ? title : findCake.type,
        desc:desc ? desc : findCake.desc,
        price:price ? price : findCake.price

    }
    let updateData = await cakeModel.findByIdAndUpdate(req.params.id,updatedbody)
    if(updateData){
        AdminLogEvent(req.body.adminId,'None','Update Cake','Success',"Successfully Updated Cake ("+updateData.title+") ",updateData._id)
        res.status(statusCode.accepted).json(updateData)
    }
    else{
        AdminLogEvent(req.body.adminId,'None','Update Cake','Failed',"Faild to Updated Cake ("+updateData.title+") ",updateData._id)
        throw new ErrorResponse("Failed To Update Cake",404)
    }
})

const getAll = asyncErrorHandler(async(req,res)=>{
    let allDaypass = await cakeModel.find({})
    if(allDaypass.length>0) {res.status(statusCode.accepted).json(allDaypass)}
    else {throw new ErrorResponse("No Cake Found",404)}
})

const del = asyncErrorHandler(async(req,res)=>{
    let allDaypass = await cakeModel.findByIdAndDelete(req.params.id)
    if(allDaypass) {
        AdminLogEvent(req.body.adminId,'None','Delete Cake','Success',"Successfully Deleted Cake ("+allDaypass.title+") ",allDaypass._id)
        res.status(statusCode.accepted).json({msg:"DELETED"})
    }
    else {throw new ErrorResponse("No Cake Found",404)}
})


module.exports = { create, getAll,del,update}