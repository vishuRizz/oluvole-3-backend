// Central toggle for payment environment.
// Set PAYMENT_MODE to either 'test' or 'live' to switch gateways.
// This is intentionally simple and does not rely on environment variables.

const PAYMENT_MODE = 'test'; // change to 'live' when you want to use live credentials

module.exports = {
  PAYMENT_MODE,
};

