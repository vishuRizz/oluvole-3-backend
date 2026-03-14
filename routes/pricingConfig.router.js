const router = require("express").Router();
const { getConfig, updateConfig } = require("../services/pricingConfig.service");

router.get("/get", getConfig);
router.put("/update", updateConfig);

module.exports = router;
