const mongoose = require("mongoose");

const adminLogsSchema = mongoose.Schema(
  {
    adminId: { type: String},
    userId: { type: String},
    action:{type:String},
    status:{type:String},
    details:{type:String},
    targetId:{type:String}
},
  { timestamps: true }
);

const adminLogs = new mongoose.model("Adminlogs", adminLogsSchema, "Adminlogs");
module.exports = adminLogs;
