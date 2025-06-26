const squadApi = require('../config/squad');
const BookingLogger = require('./bookingLogger.service');

// Payments
/**
 * Initiate a Squad payment
 * @param {Object} data - Payment data
 * @param {string} data.email - Customer's email address (required)
 * @param {number} data.amount - Amount in kobo (required)
 * @param {string} data.currency - Currency (NGN or USD, required)
 * @param {string} data.initiate_type - Must be 'inline' (required)
 * @param {string} [data.customer_name] - Customer name (optional)
 * @param {string} [data.transaction_ref] - Unique transaction reference (optional)
 * @param {string} [data.callback_url] - Callback URL (optional)
 * @param {Array<string>} [data.payment_channels] - Payment channels (optional)
 * @param {Object} [data.metadata] - Additional metadata (optional)
 * @param {boolean} [data.pass_charge] - Pass charge to customer (optional)
 * @param {string} [data.sub_merchant_id] - Sub-merchant ID (optional)
 * @param {boolean} [data.is_recurring] - For card tokenization/recurring (optional)
 * @returns {Promise<Object>} Squad API response data
 *
 * Example usage:
 * await initiatePayment({
 *   email: 'henimastic@gmail.com',
 *   amount: 43000,
 *   currency: 'NGN',
 *   initiate_type: 'inline',
 *   transaction_ref: '4678388588350909090AH',
 *   callback_url: 'http://squadco.com',
 *   payment_channels: ['card', 'bank', 'ussd'],
 *   metadata: { bookingId: '123' },
 *   pass_charge: false,
 *   is_recurring: false
 * });
 */

async function initiatePayment(data) {
  // Validate required fields
  if (!data.email || !data.amount || !data.currency || !data.initiate_type) {
    // Log failed attempt
    await BookingLogger.logBookingAttempt({
      bookingId: data.transaction_ref || 'N/A',
      userId: data.email || 'Unknown',
      status: 'failed',
      paymentStatus: 'failed',
      paymentGateway: 'Squad',
      paymentId: null,
      amount: data.amount || 0,
      currency: data.currency || 'N/A',
      errorDetails: { errorMessage: 'Missing required fields: email, amount, currency, initiate_type' },
      requestPayload: data,
      responsePayload: null,
      ipAddress: 'Unknown',
      userAgent: 'Unknown'
    });
    throw new Error('Missing required fields: email, amount, currency, initiate_type');
  }
  // Map only allowed fields
  const payload = {
    email: data.email,
    amount: data.amount,
    currency: data.currency,
    initiate_type: data.initiate_type,
    customer_name: data.customer_name,
    transaction_ref: data.transaction_ref,
    callback_url: data.callback_url,
    payment_channels: data.payment_channels,
    metadata: data.metadata,
    pass_charge: data.pass_charge,
    sub_merchant_id: data.sub_merchant_id,
    is_recurring: data.is_recurring
  };
  // Remove undefined fields
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  try {
    const response = await squadApi.post('/transaction/initiate', payload);
    // Log success
    await BookingLogger.logBookingAttempt({
      bookingId: data.transaction_ref || 'N/A',
      userId: data.email || 'Unknown',
      status: 'success',
      paymentStatus: 'success',
      paymentGateway: 'Squad',
      paymentId: response.data?.data?.transaction_ref || null,
      amount: data.amount,
      currency: data.currency,
      bookingDetails: data,
      requestPayload: data,
      responsePayload: response.data,
      ipAddress: 'Unknown',
      userAgent: 'Unknown'
    });
    return response.data;
  } catch (error) {
    // Log failure
    await BookingLogger.logBookingAttempt({
      bookingId: data.transaction_ref || 'N/A',
      userId: data.email || 'Unknown',
      status: 'failed',
      paymentStatus: 'failed',
      paymentGateway: 'Squad',
      paymentId: null,
      amount: data.amount,
      currency: data.currency,
      errorDetails: {
        errorMessage: error.message,
        stackTrace: error.stack,
        response: error.response?.data
      },
      requestPayload: data,
      responsePayload: error.response?.data,
      ipAddress: 'Unknown',
      userAgent: 'Unknown'
    });
    throw error;
  }
}

async function verifyTransaction(reference) {
  if (!reference) {
    await BookingLogger.logBookingAttempt({
      bookingId: reference || 'N/A',
      userId: 'Unknown',
      status: 'failed',
      paymentStatus: 'failed',
      paymentGateway: 'Squad',
      paymentId: null,
      amount: 0,
      currency: 'N/A',
      errorDetails: { errorMessage: 'Missing required parameter: reference' },
      requestPayload: { reference },
      responsePayload: null,
      ipAddress: 'Unknown',
      userAgent: 'Unknown'
    });
    throw new Error('Missing required parameter: reference');
  }
  try {
    const response = await squadApi.get(`/transaction/verify/${reference}`);
    await BookingLogger.logBookingAttempt({
      bookingId: reference,
      userId: 'Unknown',
      status: 'success',
      paymentStatus: response.data?.data?.transaction_status || 'unknown',
      paymentGateway: 'Squad',
      paymentId: reference,
      amount: response.data?.data?.transaction_amount || 0,
      currency: response.data?.data?.transaction_currency_id || 'N/A',
      bookingDetails: { reference },
      requestPayload: { reference },
      responsePayload: response.data,
      ipAddress: 'Unknown',
      userAgent: 'Unknown'
    });
    return {
      status: response.data.status,
      message: response.data.message,
      data: response.data.data || null
    };
  } catch (err) {
    await BookingLogger.logBookingAttempt({
      bookingId: reference,
      userId: 'Unknown',
      status: 'failed',
      paymentStatus: 'failed',
      paymentGateway: 'Squad',
      paymentId: reference,
      amount: 0,
      currency: 'N/A',
      errorDetails: {
        errorMessage: err.message,
        stackTrace: err.stack,
        response: err.response?.data
      },
      requestPayload: { reference },
      responsePayload: err.response?.data,
      ipAddress: 'Unknown',
      userAgent: 'Unknown'
    });
    if (err.response && err.response.data) {
      return {
        status: err.response.data.status || err.response.status,
        message: err.response.data.message || 'Verification failed',
        data: null
      };
    }
    throw err;
  }
}

// Squad POS
async function getAllTransactions({ perPage, page, date_from, date_to, sort_by, sort_by_dir }) {
  const params = { perPage, page };
  if (date_from) params.date_from = date_from;
  if (date_to) params.date_to = date_to;
  if (sort_by) params.sort_by = sort_by;
  if (sort_by_dir) params.sort_by_dir = sort_by_dir;
  const response = await squadApi.get('/softpos/transactions', { params });
  return response.data;
}

async function createTerminal({ name, email, phone, location_id }) {
  const response = await squadApi.post('/softpos/terminal', { name, email, phone, location_id });
  return response.data;
}

async function getAllTerminals({ page, perPage, location_id, sort_by, sort_by_dir, date_from, date_to, active }) {
  const params = { page, perPage };
  if (location_id) params.location_id = location_id;
  if (sort_by) params.sort_by = sort_by;
  if (sort_by_dir) params.sort_by_dir = sort_by_dir;
  if (date_from) params.date_from = date_from;
  if (date_to) params.date_to = date_to;
  if (active !== undefined) params.active = active;
  const response = await squadApi.get('/softpos/terminals', { params });
  return response.data;
}

module.exports = {
  initiatePayment,
  verifyTransaction,
  getAllTransactions,
  createTerminal,
  getAllTerminals,
}; 