const express = require("express");
const router = express.Router();
const Paystack = require("../config/paystack");
const logger = require("../utils/logger");

// Initiate a payment
router.post("/initialize", async (req, res) => {
  const { email, amount } = req.body;

  try {
    logger.info("Payment initiated", { email, amount });
    const response = await Paystack.transaction.initialize({
      email,
      amount: amount * 100,
    });
    res.json(response);
  } catch (error) {
    logger.error("Payment initiation error", { email, error: error.message });
    res.status(500).json(error);
  }
});

// Verify a payment
router.get("/verify/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    logger.info("Payment verification initiated", { reference });
    const response = await Paystack.transaction.verify(reference);
    console.log("verified");
    res.json(response);
  } catch (error) {
    logger.error("Payment verification error", {
      reference,
      error,
    });
    console.error("Payment verification error:", error);
    res.status(500).json(error);
  }
});

module.exports = router;
