const { createOrUpdate, getAll, del } = require("../services/disable.service");

const router = require("express").Router();

router.post("/create", createOrUpdate);
router.get("/get", getAll);
router.delete("/delete/:id", del);

module.exports = router;
