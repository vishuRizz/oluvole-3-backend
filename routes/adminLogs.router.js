const {getAdminLogs} = require("../services/adminLogs.service");
const router = require("express").Router();
router.get("/logs",getAdminLogs); 

module.exports = router;