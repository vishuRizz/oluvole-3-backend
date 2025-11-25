const mongoose = require("mongoose");

const daypassSchema = mongoose.Schema({
    name:{type:String,required:true},
    email:{type:String,required:true},
    mobile:{type:String,required:true},
    optionType:{type:String},
    totalGuest:{type:String,required:true},
    visitingDate:{type:String,required:true},
    reference: { type: String, unique: true, index: true },
    status: { type: String, default: 'pending' }
},{timestamps:true})

const DayPass = mongoose.model('DayPass',daypassSchema,'DayPass')
module.exports = DayPass