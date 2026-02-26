const { getAdminLogs, getPaginatedAdminLogs } = require("../services/adminLogs.service");
const router = require("express").Router();
router.get("/logs", getAdminLogs);
router.get("/logs/paginated", getPaginatedAdminLogs);

module.exports = router;