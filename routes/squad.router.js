const express = require('express');
const router = express.Router();
const squadService = require('../services/squad.service');
const { handleSquadWebhook } = require('../services/squad.service');

// Initiate Payment
router.post('/payments/initiate', async (req, res) => {
  try {
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
    const response = await squadService.verifyTransaction(req.params.reference, bookingDetails);
    // If paymentRecord is present, return it directly for frontend use
    res.status(200).json({
      status: response.status,
      message: response.message,
      data: response.data,
      paymentRecord: response.paymentRecord || null
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