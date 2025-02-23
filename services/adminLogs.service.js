const Log = require('../models/adminLogs.schema');
const { adminLogsModel } = require("../models");
const { asyncErrorHandler, ErrorResponse } = require("../middlewares/error/error");
const { statusCode } = require("../utils/statusCode");

module.exports.AdminLogEvent = async (adminId = '',userId = '',action='',status='',details='',targetId='') => {
  try {
    const logData = {
        adminId,
        userId,
        action,
        status,
        details,
        targetId
    }
    const logEntry = new Log(logData);
    await logEntry.save();
    console.log('Log saved successfully:', logEntry);
  } catch (error) {
    console.error('Failed to save log:', error);
  }
};

module.exports.getAdminLogs = asyncErrorHandler(async (req, res) => {
  let allLogs = await adminLogsModel.find({}).sort({ createdAt: -1 });
  if(allLogs.length>0) {res.status(statusCode.accepted).json(allLogs)}
  else {throw new ErrorResponse("No Logs Found",404)}
});
// module.exports = AdminLogEvent