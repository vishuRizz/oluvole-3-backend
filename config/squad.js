const axios = require('axios');
const { PAYMENT_MODE } = require('./paymentMode');

// sandbox secret key for now (kept for reference)
// const SQUAD_SECRET_KEY = 'sandbox_sk_abd096f23950b7306d3cb117f148500369784c7fc306';
// const BASE_URL = 'https://sandbox-api-d.squadco.com';

// real secret key (kept and used when PAYMENT_MODE === 'live')
const SQUAD_SECRET_KEY = 'sk_f93de12c7052492763433ca4197f1d1bae73512e';
const BASE_URL = 'https://api-d.squadco.com'; // production base URL

// Hardcoded sandbox credentials for test mode
const SANDBOX_SQUAD_SECRET_KEY = 'sandbox_sk_abd096f23950b7306d3cb117f148500369784c7fc306';
const SANDBOX_BASE_URL = 'https://sandbox-api-d.squadco.com';

// Select active credentials based on PAYMENT_MODE
const ACTIVE_SQUAD_SECRET_KEY =
  PAYMENT_MODE === 'live' ? SQUAD_SECRET_KEY : SANDBOX_SQUAD_SECRET_KEY;
const ACTIVE_BASE_URL =
  PAYMENT_MODE === 'live' ? BASE_URL : SANDBOX_BASE_URL;

const squadApi = axios.create({
  baseURL: ACTIVE_BASE_URL,
  headers: {
    Authorization: ACTIVE_SQUAD_SECRET_KEY,
    'Content-Type': 'application/json',
  },
});

module.exports = squadApi; 