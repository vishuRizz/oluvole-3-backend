const axios = require('axios');

// sandbox secret key for now
const SQUAD_SECRET_KEY = 'sandbox_sk_abd096f23950b7306d3cb117f148500369784c7fc306';
const BASE_URL = 'https://sandbox-api-d.squadco.com';
// real secret key
// const SQUAD_SECRET_KEY = 'sk_f93de12c7052492763433ca4197f1d1bae73512e';
// const BASE_URL = 'https://api-d.squadco.com'; // switched to production base URL

const squadApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: SQUAD_SECRET_KEY,
    'Content-Type': 'application/json',
  },
});

module.exports = squadApi; 