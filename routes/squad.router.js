const express = require('express');
const router = express.Router();
const squadService = require('../services/squad.service');

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
router.get('/payments/verify/:reference', async (req, res) => {
  try {
    const response = await squadService.verifyTransaction(req.params.reference);
    res.status(200).json(response.data);
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

module.exports = router; 