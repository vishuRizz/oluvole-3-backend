const { PAYMENT_MODE } = require('./paymentMode');

// Hardcoded Paystack keys for easy switching without env.
// Replace these placeholder strings with your real keys.
const LIVE_PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY || 'sk_live_your_real_live_key_here';
const TEST_PAYSTACK_SECRET_KEY = 'sk_test_your_real_test_key_here';

const ACTIVE_PAYSTACK_SECRET_KEY =
  PAYMENT_MODE === 'live' ? LIVE_PAYSTACK_SECRET_KEY : TEST_PAYSTACK_SECRET_KEY;

const Paystack = require('paystack')(ACTIVE_PAYSTACK_SECRET_KEY);

module.exports = Paystack;
