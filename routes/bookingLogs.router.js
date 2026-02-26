const express = require('express');
const router = express.Router();
const BookingLogger = require('../services/bookingLogger.service.js');

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
        const logs = await BookingLogger.getAllBookingLogs();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get paginated booking logs
router.get('/paginated', async (req, res) => {
    try {
        const result = await BookingLogger.getPaginatedBookingLogs(req.query.page, req.query.limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark issue as resolved
router.patch('/resolve/:id', async (req, res) => {
    try {
        const logEntry = await BookingLogger.resolveIssue(req.params.id);
        res.json(logEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check-in a booking
router.patch('/check-in/:id', async (req, res) => {
    try {
        const logEntry = await BookingLogger.checkInBooking(req.params.id);
        if (!logEntry) {
            return res.status(404).json({ error: 'Booking log not found' });
        }
        res.json(logEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check-out a booking
router.patch('/check-out/:id', async (req, res) => {
    try {
        const logEntry = await BookingLogger.checkOutBooking(req.params.id);
        if (!logEntry) {
            return res.status(404).json({ error: 'Booking log not found' });
        }
        res.json(logEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel a booking by reference
router.patch('/cancel/:ref', async (req, res) => {
    try {
        const result = await BookingLogger.cancelBooking(req.params.ref);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get complete booking status by reference - single API
router.get('/booking-status/:ref', async (req, res) => {
    try {
        const result = await BookingLogger.getBookingStatus(req.params.ref);
        res.json(result);
    } catch (error) {
        console.error('Error fetching booking status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update guest notes/preferences from admin booking detail page
router.patch('/guest-notes', async (req, res) => {
    try {
        const { email, ...updates } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Guest email is required' });
        }
        const result = await BookingLogger.updateGuestNotes(email, updates);
        if (!result) {
            return res.status(404).json({ error: 'Guest not found' });
        }
        res.json({ message: 'Guest notes updated', guest: result });
    } catch (error) {
        console.error('Error updating guest notes:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;