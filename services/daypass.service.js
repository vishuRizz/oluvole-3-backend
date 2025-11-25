const { asyncErrorHandler, ErrorResponse } = require("../middlewares/error/error");
const { daypassModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const { v4: uuidv4 } = require('uuid');
const DaypassBooking = require('../models/daypass.schema');


const create = asyncErrorHandler(async(req,res)=>{
    // let {name,gender,email,mobile,member,birthdayReminded} = req.body
    let createDaypass = await daypassModel.create(req.body)
    if(createDaypass){
        res.status(statusCode.accepted).json(createDaypass)
    }
    else{
        throw new ErrorResponse("Failed To Create Guest",404)
    }
})

const getAll = asyncErrorHandler(async(req,res)=>{
    let allDaypass = await daypassModel.find({})
    if(allDaypass.length>0) {res.status(statusCode.accepted).json(allDaypass)}
    else {throw new ErrorResponse("No Daypass Booking Found",404)}
})


const getSingle = asyncErrorHandler(async(req,res)=>{
    let daypass = await daypassModel.findById(req.params.id)
    if(!daypass) {res.status(statusCode.accepted).json(daypass)}
    else {throw new ErrorResponse("No Daypass Booking Found",404)}
})

const initiateDaypassBooking = async (req, res) => {
  try {
    const bookingDetails = req.body;
    // Generate a unique reference
    const reference = `JARA-SQUAD-${uuidv4()}`;
    const newBooking = new DaypassBooking({
      ...bookingDetails,
      reference,
      status: 'pending',
      createdAt: new Date(),
    });
    await newBooking.save();
    return res.status(201).json({ reference });
  } catch (err) {
    console.error('Error initiating daypass booking:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { create, getAll, getSingle, initiateDaypassBooking };