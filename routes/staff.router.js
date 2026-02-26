const { createStaff, updateStaff, getAll, getPaginatedStaff, getSingle, deleteStaff } = require('../services/staff.service')

const router = require('express').Router()

router.post("/create", createStaff)
router.get("/get", getAll)
router.get("/get/paginated", getPaginatedStaff)
router.delete("/delete/:id", deleteStaff)

module.exports = router