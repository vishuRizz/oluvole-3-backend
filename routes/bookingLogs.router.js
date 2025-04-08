const express = require('express');
const router = express.Router();
const BookingLogger = require('../services/bookingLogger.service.js');
const BookingLog = require('../models/bookingLog.schema.js');

// Log booking attempt
router.post('/log', async (req, res) => {
    try {
        const logEntry = await BookingLogger.logBookingAttempt(req.body);
        res.status(201).json(logEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get failed bookings with successful payments
router.get('/payment-success-booking-failures', async (req, res) => {
    try {
        const logs = await BookingLogger.getFailedBookingsWithSuccessfulPayments();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all booking logs
router.get('/all-booking-logs', async (req, res) => {
    try {
        const logs = await BookingLog.find().sort({ timestamp: -1 }); // Sort by timestamp in descending order
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark issue as resolved
router.patch('/resolve/:id', async (req, res) => {
    try {
        const logEntry = await BookingLog.findByIdAndUpdate(
            req.params.id,
            { resolved: true },
            { new: true }
        );
        res.json(logEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;