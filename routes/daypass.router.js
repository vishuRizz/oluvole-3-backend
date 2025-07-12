const { create, getAll, getSingle } = require('../services/daypass.service')
const express = require('express')
const router = express.Router()
const { initiateDaypassBooking } = require('../services/daypass.service')

router.post("/create",create)
router.get("/get/all",getAll)
router.get("/get/single/:id",getSingle)

// Initiate booking before payment
router.post('/bookings/initiate', initiateDaypassBooking)

module.exports = router