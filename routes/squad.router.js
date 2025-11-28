const express = require('express');
const router = express.Router();
const squadService = require('../services/squad.service');
const { handleSquadWebhook } = require('../services/squad.service');
const {
  checkRoomAvailability,
  checkMultiNightAvailability,
} = require('../utils/availabilityChecker');
const { normalizeRoomDetails } = require('../utils/nightlyAssignments');

// Initiate Payment
router.post('/payments/initiate', async (req, res) => {
  try {
    const metadata = req.body.metadata;

    if (metadata && metadata.roomDetails) {
      let roomDetails = metadata.roomDetails;

      if (typeof roomDetails === 'string') {
        try {
          roomDetails = JSON.parse(roomDetails);
        } catch (e) {
          console.error('Failed to parse roomDetails:', e);
        }
      }

      roomDetails = normalizeRoomDetails(roomDetails);

      let availabilityCheck;

      if (roomDetails.multiNightSelections) {
        availabilityCheck = await checkMultiNightAvailability(
          roomDetails.multiNightSelections
        );
      } else if (
        roomDetails.selectedRooms &&
        roomDetails.visitDate &&
        roomDetails.endDate
      ) {
        const roomIds = roomDetails.selectedRooms.map((room) => room.id);
        availabilityCheck = await checkRoomAvailability(
          roomIds,
          roomDetails.visitDate,
          roomDetails.endDate
        );
      }

      if (availabilityCheck && !availabilityCheck.available) {
        console.error('🚫 PAYMENT BLOCKED: Rooms not available', {
          conflicts: availabilityCheck.conflicts,
          message: availabilityCheck.message,
        });

        return res.status(409).json({
          success: false,
          error: 'ROOM_NOT_AVAILABLE',
          message: availabilityCheck.message,
          conflicts: availabilityCheck.conflicts,
        });
      }
    }

    const response = await squadService.initiatePayment(req.body);
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Verify Transaction
router.post('/payments/verify/:reference', async (req, res) => {
  try {
    // Accept booking details in the body for email/log context
    const bookingDetails = req.body?.bookingDetails || null;
    const response = await squadService.verifyTransaction(
      req.params.reference,
      bookingDetails
    );
    // If paymentRecord is present, return it directly for frontend use
    res.status(200).json({
      status: response.status,
      message: response.message,
      data: response.data,
      paymentRecord: response.paymentRecord || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Get All POS Transactions
router.get('/pos/transactions', async (req, res) => {
  try {
    const response = await squadService.getAllTransactions(req.query);
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Create Terminal
router.post('/pos/terminal', async (req, res) => {
  try {
    const response = await squadService.createTerminal(req.body);
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Get All Terminals
router.get('/pos/terminals', async (req, res) => {
  try {
    const response = await squadService.getAllTerminals(req.query);
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Squad payment webhook /squad/webhook
router.post('/webhook', handleSquadWebhook);

module.exports = router;
