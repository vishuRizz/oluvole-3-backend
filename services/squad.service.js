const squadApi = require('../config/squad');
const BookingLogger = require('./bookingLogger.service');
const { sendEmail } = require('../config/mail.config');
const Payment = require('../models/payment.schema');
const { overnightBooking } = require('../models/overnight.booking.schema');
const { daypassBooking } = require('../models/overnight.booking.schema');
const { normalizeRoomDetails } = require('../utils/nightlyAssignments');
// Replace: const { nanoid } = require('nanoid');
// With dynamic import helper for nanoid
const nanoid = async () => (await import('nanoid')).nanoid;
const crypto = require('crypto');

// Replace with your Squad secret key
const SQUAD_SECRET = process.env.SQUAD_SECRET || 'YOUR_SQUAD_SECRET';

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
    // Log payment initiation (not success - payment is still pending)
    await BookingLogger.logBookingAttempt({
      bookingId: data.transaction_ref || 'N/A',
      userId: data.email || 'Unknown',
      status: 'pending',
      paymentStatus: 'pending',
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

async function verifyTransaction(reference, bookingDetails = null) {
  console.log('=== SQUAD VERIFICATION START ===');
  
  // Ensure these are always defined
  let guestDetails = {};
  let roomDetails = {};
  let guestCount = {};
  let costBreakDown = {};
  let bookingType = '';
  let Body = {};

  if (bookingDetails) {
    guestDetails = typeof bookingDetails.guestDetails === 'string'
      ? JSON.parse(bookingDetails.guestDetails)
      : bookingDetails.guestDetails || {};
    roomDetails = typeof bookingDetails.roomDetails === 'string'
      ? JSON.parse(bookingDetails.roomDetails)
      : bookingDetails.roomDetails || {};
    roomDetails = normalizeRoomDetails(roomDetails);
    guestCount = bookingDetails.guestCount || {};
    costBreakDown = bookingDetails.costBreakDown || {};
    Body = bookingDetails; // fallback for email, etc.
    // Determine booking type
    if (roomDetails.visitDate) bookingType = 'overnight';
    else if (roomDetails.startDate) bookingType = 'daypass';
  }

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
    console.log("response", response);
    // Always use naira for amount (divide by 100 if Squad returns kobo)
    const transactionAmount = response.data?.data?.transaction_amount ? Number(response.data.data.transaction_amount) / 100 : 0;
    let paymentStatus = response.data?.data?.transaction_status || 'unknown';
    let paymentRecord = null;
    // Always create payment record, regardless of status
    if (bookingDetails) {
      // If VAT is not provided or invalid, calculate it from the total amount.
      if ((!bookingDetails.vat || isNaN(parseFloat(bookingDetails.vat))) && transactionAmount > 0) {
        const calculatedSubTotal = transactionAmount / 1.125;
        bookingDetails.vat = transactionAmount - calculatedSubTotal;
        // Only overwrite subTotal if it's not a valid number
        if (!bookingDetails.subTotal || isNaN(parseFloat(bookingDetails.subTotal))) {
          bookingDetails.subTotal = calculatedSubTotal;
        }
      }

      // If totalCost is missing or empty, set it to transactionAmount
      if (!bookingDetails.totalCost || bookingDetails.totalCost === '' || bookingDetails.totalCost === 0) {
        bookingDetails.totalCost = transactionAmount;
      }
      try {
        let payment = await Payment.findOne({ ref: reference });
        if (payment) {
          payment.name = bookingDetails.name || '';
          payment.amount = transactionAmount;
          payment.status = paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1);
          payment.ref = reference;
          payment.method = 'Squad';
          payment.guestDetails = JSON.stringify(guestDetails);
          payment.roomDetails = JSON.stringify(roomDetails);
          payment.bookingInfo = bookingDetails.bookingInfo ? JSON.stringify(bookingDetails.bookingInfo) : '';
          payment.subTotal = bookingDetails.subTotal || '';
          payment.vat = bookingDetails.vat || '';
          payment.totalCost = bookingDetails.totalCost || transactionAmount;
          payment.discount = bookingDetails.discount || 0;
          payment.voucher = bookingDetails.voucher || 0;
          payment.multiNightDiscount = bookingDetails.multiNightDiscount || 0;
          payment.previousCost = bookingDetails.previousCost || 0;
          payment.previousPaymentStatus = bookingDetails.previousPaymentStatus || '';
          payment.roomsPrice = bookingDetails.roomsPrice || '';
          payment.extrasPrice = bookingDetails.extrasPrice || '';
          payment.roomsDiscount = bookingDetails.roomsDiscount || '';
          payment.discountApplied = bookingDetails.discountApplied || '';
          payment.voucherApplied = bookingDetails.voucherApplied || '';
          payment.priceAfterVoucher = bookingDetails.priceAfterVoucher || '';
          payment.priceAfterDiscount = bookingDetails.priceAfterDiscount || '';
          paymentRecord = await payment.save();
        } else {
          paymentRecord = payment = await Payment.create({
            name: bookingDetails.name || '',
            amount: transactionAmount,
            status: paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1),
            ref: reference,
            method: 'Squad',
            guestDetails: JSON.stringify(guestDetails),
            roomDetails: JSON.stringify(roomDetails),
            bookingInfo: bookingDetails.bookingInfo ? JSON.stringify(bookingDetails.bookingInfo) : '',
            subTotal: bookingDetails.subTotal || '',
            vat: bookingDetails.vat || '',
            totalCost: bookingDetails.totalCost || transactionAmount,
            discount: bookingDetails.discount || 0,
            voucher: bookingDetails.voucher || 0,
            multiNightDiscount: bookingDetails.multiNightDiscount || 0,
            previousCost: bookingDetails.previousCost || 0,
            previousPaymentStatus: bookingDetails.previousPaymentStatus || '',
            roomsPrice: bookingDetails.roomsPrice || '',
            extrasPrice: bookingDetails.extrasPrice || '',
            roomsDiscount: bookingDetails.roomsDiscount || '',
            discountApplied: bookingDetails.discountApplied || '',
            voucherApplied: bookingDetails.voucherApplied || '',
            priceAfterVoucher: bookingDetails.priceAfterVoucher || '',
            priceAfterDiscount: bookingDetails.priceAfterDiscount || ''
          });
        }
        if (!paymentRecord) {
          console.error('Failed to create Squad payment record: No record returned');
        }
        // Also create booking record in overnight.booking collection if it's an overnight booking
        if (bookingDetails?.roomDetails) {
          try {
            
            // Already parsed roomDetails and guestDetails above
            // Check if it's an overnight booking (has visitDate)
            if (roomDetails?.visitDate) {
              const totalGuest = roomDetails?.selectedRooms?.[0]?.guestCount?.adults || 0;
              
              const bookingData = {
                totalGuest: totalGuest,
                bookingDetails: roomDetails,
                guestDetails: guestDetails,
                shortId: reference, // Use the same reference as payment
              };
              
              const bookingRecord = await overnightBooking.create(bookingData);
            }
            // Check if it's a daypass booking (has startDate)
            else if (roomDetails?.startDate) {
              const totalGuest = roomDetails?.adultsCount || 0;
              
              const bookingData = {
                totalGuest: totalGuest,
                bookingDetails: roomDetails,
                guestDetails: guestDetails,
                shortId: reference, // Use the same reference as payment
              };
              
              const bookingRecord = await daypassBooking.create(bookingData);
              console.log('✅ SQUAD: Created daypass booking record for Squad payment:', reference, 'Record ID:', bookingRecord._id);
            } else {
              console.log('❌ SQUAD: No visitDate or startDate found in roomDetails, cannot determine booking type');
              console.log('❌ SQUAD: Available roomDetails keys:', Object.keys(roomDetails || {}));
              console.log('❌ SQUAD: RoomDetails content:', JSON.stringify(roomDetails, null, 2));
            }
          } catch (bookingError) {
            console.error('❌ SQUAD: Failed to create booking record for Squad payment:', bookingError);
            console.error('❌ SQUAD: Error details:', bookingError.message);
            console.error('❌ SQUAD: Error stack:', bookingError.stack);
            console.error('❌ SQUAD: Error name:', bookingError.name);
            console.error('❌ SQUAD: Error code:', bookingError.code);
          }
        } else {
          console.log('❌ SQUAD: No roomDetails provided in bookingDetails, skipping booking record creation');
          console.log('❌ SQUAD: Available bookingDetails keys:', Object.keys(bookingDetails || {}));
          console.log('❌ SQUAD: BookingDetails content:', JSON.stringify(bookingDetails, null, 2));
        }
      } catch (paymentError) {
        console.error('Failed to create Squad payment record:', paymentError);
      }
    }
    // Log booking attempt with naira amount and correct status
    try {
      await BookingLogger.logBookingAttempt({
        bookingId: reference,
        userId: bookingDetails?.email || 'Unknown',
        status: paymentStatus === 'success' ? 'success' : paymentStatus,
        paymentStatus: paymentStatus,
        paymentGateway: 'Squad',
        paymentId: reference,
        amount: transactionAmount, // Always naira
        currency: response.data?.data?.transaction_currency_id || 'N/A',
        bookingDetails: bookingDetails || { reference },
        requestPayload: { reference },
        responsePayload: response.data,
        ipAddress: 'Unknown',
        userAgent: 'Unknown'
      });
    } catch (bookingLogError) {
      // If payment was successful but booking log failed, log this special case
      if (paymentStatus === 'success' && paymentRecord) {
        try {
          await BookingLogger.logPaymentSuccessBookingFailure(paymentRecord, bookingLogError);
          console.info('Logged payment success, booking failed (Squad)', { paymentId: paymentRecord._id });
        } catch (logError) {
          console.error('Failed to log payment success/booking failure (Squad)', { originalError: bookingLogError.message, loggingError: logError.message });
        }
      }
      // Optionally, rethrow or handle the error as needed
    }
    // Send confirmation emails (always attempt, even if email is missing)
    const formatPrice = (val) => {
      if (!val || isNaN(val)) return '';
      return `₦${Number(val).toLocaleString()}`;
    };
    
    function formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      const options = { year: "numeric", month: "long", day: "numeric" };
      return date.toLocaleDateString("en-US", options);
    }
    
    // After paymentRecord is created, use its fields for emailContext if available
    const getField = (field, fallback) => {
      if (paymentRecord && paymentRecord[field] !== undefined && paymentRecord[field] !== null && paymentRecord[field] !== '') {
        return paymentRecord[field];
      }
      return fallback;
    };
    // Calculate totalGuests as in payment.service.js
    let totalGuests = 0;
    if (roomDetails?.visitDate && roomDetails?.selectedRooms?.[0]?.guestCount) {
      const gc = roomDetails.selectedRooms[0].guestCount;
      totalGuests = (gc.adults ?? 0) + (gc.children ?? 0) + (gc.toddlers ?? 0) + (gc.infants ?? 0);
    } else if (guestCount) {
      totalGuests = (guestCount.adults ?? 0) + (guestCount.children ?? 0) + (guestCount.toddler ?? 0) + (guestCount.infants ?? 0);
    }

    let extrasList = 'No Extras';
    if (bookingType === 'overnight' && roomDetails.finalData && roomDetails.finalData.length > 0) {
        extrasList = roomDetails.finalData.map(e => e.title).join(', ');
    } else if (bookingType === 'daypass' && roomDetails.extras && roomDetails.extras.length > 0) {
        extrasList = roomDetails.extras.map(e => e.title).join(', ');
    }

    function isValidNumber(val) {
      return !isNaN(parseFloat(val)) && isFinite(val);
    }
    // Format room names for bookingType
    const roomNames = roomDetails?.selectedRooms && roomDetails.selectedRooms.length > 0
      ? roomDetails.selectedRooms.map((room) => room.title).join(", ")
      : bookingType || "Day Pass";
    
    const emailContext = {
      name: guestDetails.firstname || Body?.email || 'Guest',
      email: Body?.email || 'unknown@unknown.com',
      id: reference,
      bookingType: roomNames,
      checkIn: roomDetails.visitDate 
        ? formatDate(roomDetails.visitDate)
        : roomDetails.startDate 
        ? formatDate(roomDetails.startDate)
        : '',
      checkOut: roomDetails.endDate 
        ? formatDate(roomDetails.endDate)
        : 'N/A',
      numberOfGuests: roomDetails?.visitDate && roomDetails?.selectedRooms?.[0]?.guestCount
        ? `${roomDetails.selectedRooms[0].guestCount.adults ?? 0} Adults, ${roomDetails.selectedRooms[0].guestCount.children ?? 0} Children, ${roomDetails.selectedRooms[0].guestCount.toddlers ?? 0} Toddlers, ${roomDetails.selectedRooms[0].guestCount.infants ?? 0} Infants`
        : `${guestCount.adults ?? 0} Adults, ${guestCount.children ?? 0} Children, ${guestCount.toddler ?? 0} Toddlers, ${guestCount.infants ?? 0} Infants`,
      numberOfNights: (roomDetails.visitDate && roomDetails.endDate) ? Math.ceil((new Date(roomDetails.endDate) - new Date(roomDetails.visitDate)) / (1000 * 60 * 60 * 24)) : 'N/A',
      extras: extrasList,
      subTotal: bookingDetails.subTotal ? formatPrice(bookingDetails.subTotal) : '',
      multiNightDiscount: getField('multiNightDiscount', costBreakDown.multiNightDiscount) ? formatPrice(getField('multiNightDiscount', costBreakDown.multiNightDiscount)) : '0',
      clubMemberDiscount: getField('clubMemberDiscount', costBreakDown.clubDiscountApplied) ? formatPrice(getField('clubMemberDiscount', costBreakDown.clubDiscountApplied)) : '0',
      multiNightDiscountAvailable: getField('multiNightDiscountAvailable', costBreakDown.multiNightDiscountAvailable) ? formatPrice(getField('multiNightDiscountAvailable', costBreakDown.multiNightDiscountAvailable)) : '',
      vat: bookingDetails.vat ? `${formatPrice(bookingDetails.vat)}` : '',
      totalCost: bookingDetails.totalCost || transactionAmount,
      totalGuests: totalGuests,
      roomsPrice: bookingDetails.roomsPrice || '',
      extrasPrice: bookingDetails.extrasPrice || '0',
      roomsDiscount: bookingDetails.roomsDiscount || 'N/A',
      voucherApplied: (costBreakDown.voucherApplied === 'true') ? 'Yes' : (costBreakDown.voucherApplied === 'false' ? 'No' : 'N/A'),
      discountApplied: (costBreakDown.discountApplied === 'true') ? 'Yes' : (costBreakDown.discountApplied === 'false' ? 'No' : 'N/A'),
      clubDiscountApplied: (costBreakDown.clubDiscountApplied === 'true') ? 'Yes' : (costBreakDown.clubDiscountApplied === 'false' ? 'No' : 'N/A'),
      priceAfterVoucher: isValidNumber(costBreakDown.priceAfterVoucher) ? formatPrice(costBreakDown.priceAfterVoucher) : (isValidNumber(bookingDetails.totalCost) ? formatPrice(bookingDetails.totalCost) : 'N/A'),
      priceAfterDiscount: isValidNumber(costBreakDown.priceAfterDiscount) ? formatPrice(costBreakDown.priceAfterDiscount) : (isValidNumber(bookingDetails.totalCost) ? formatPrice(bookingDetails.totalCost) : 'N/A'),
      priceAfterClubDiscount: isValidNumber(costBreakDown.priceAfterClubDiscount) ? formatPrice(costBreakDown.priceAfterClubDiscount) : (isValidNumber(bookingDetails.totalCost) ? formatPrice(bookingDetails.totalCost) : 'N/A'),
    };
    console.log('Email Context: ', emailContext);
    try {
      await sendEmail(
        Body.email || 'unknown@unknown.com',
        'Your Booking Is Confirmed',
        'confirmation',
        emailContext
      );
      await sendEmail(
        'bookings@jarabeachresort.com',
        'New Booking Confirmed',
        'confirmation',
        emailContext
      );
    } catch (emailError) {
      console.error('Failed to send Squad payment confirmation emails:', emailError);
    }
    return {
      status: response.data.status,
      message: response.data.message,
      data: response.data.data || null,
      paymentRecord: paymentRecord || null
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

const handleSquadWebhook = async (req, res) => {
  let reference = null;
  let responsePayload = null;
  
  try {
    // 1. Log incoming webhook
    console.log('--- SQUAD WEBHOOK RECEIVED ---');
    console.log('Body:', req.body);

    // 2. Parse event and transaction status
    const { Event, TransactionRef, Body } = req.body;
    reference = Body?.transaction_ref || TransactionRef;
    responsePayload = Body;
    
    // 3. Extract meta fields and construct bookingDetails like verifyTransaction expects
    const meta = Body?.meta || {};
    let guestDetails, roomDetails, guestCount, bookingInfo;

    // Distinguish between daypass and other booking types from webhook
    if (meta.availablity && meta.guestInfo) {
      // Daypass booking
      guestDetails = meta.guestInfo || {};
      roomDetails = meta.availablity || {};
      bookingInfo = meta.bookingInfo || {};
      guestCount = {
        adults: (bookingInfo.adultsAlcoholic || 0) + (bookingInfo.adultsNonAlcoholic || 0),
        children: bookingInfo.childTotal || 0,
        toddler: 0,
        infants: 0
      };
    } else {
      // Overnight or other booking types
      guestDetails = meta.guestDetails || {};
      roomDetails = meta.roomDetails || {};
      guestCount = meta.guestCount || {};
      bookingInfo = meta.bookingInfo || {};
    }
    const costBreakDown = meta.costBreakDown || {};

    console.log('meta', meta);
    console.log('Guest Details', guestDetails)
    console.log('Room Details', roomDetails)
    console.log('Cost Details', costBreakDown)
    
    // Construct bookingDetails object that matches what verifyTransaction expects
    const bookingDetails = {
      name: guestDetails.firstname || Body?.email || 'Unknown',
      email: guestDetails.email || Body?.email || 'unknown@unknown.com',
      guestDetails: guestDetails,
      roomDetails: roomDetails,
      guestCount: guestCount,
      bookingInfo: bookingInfo,
      subTotal: costBreakDown.RoomsPrice || '',
      vat: costBreakDown.Vat || '',
      totalCost: costBreakDown.TotalCost || '',
      discount: costBreakDown.Discount || 0,
      voucher: costBreakDown.Voucher || 0,
      multiNightDiscount: costBreakDown.MultiNightDiscount || 0,
      previousCost: costBreakDown.PreviousCost || 0,
      previousPaymentStatus: costBreakDown.PreviousPaymentStatus || '',
      roomsPrice: costBreakDown.RoomsPrice || '',
      extrasPrice: costBreakDown.ExtrasPrice || '',
      roomsDiscount: costBreakDown.RoomsDiscount || '',
      discountApplied: costBreakDown.DiscountApplied || '',
      voucherApplied: costBreakDown.VoucherApplied || '',
      priceAfterVoucher: costBreakDown.PriceAfterVoucher || '',
      priceAfterDiscount: costBreakDown.PriceAfterDiscount || ''
    };

    // 4. Use the existing verifyTransaction function with constructed bookingDetails
    // verifyTransaction will handle all logging internally
    const verificationResult = await verifyTransaction(reference, bookingDetails);
    
    // 5. Return success response
    return res.status(200).json({ 
      message: 'Webhook processed successfully',
      verificationResult: verificationResult
    });
    
  } catch (err) {
    console.error('Squad webhook error:', err);
    
    // Only log if this is an error that occurred BEFORE calling verifyTransaction
    // (like missing reference, invalid webhook format, etc.)
    // If verifyTransaction was called and failed, it already logged the error
    if (!reference) {
      await BookingLogger.logBookingAttempt({
        bookingId: reference || 'N/A',
        userId: 'Unknown',
        status: 'failed',
        paymentStatus: 'failed',
        paymentGateway: 'Squad',
        paymentId: reference || null,
        amount: 0,
        currency: 'N/A',
        errorDetails: { 
          errorMessage: err.message, 
          stackTrace: err.stack 
        },
        requestPayload: req.body,
        responsePayload: responsePayload,
        ipAddress: req.ip || 'Unknown',
        userAgent: req.headers['user-agent'] || 'Unknown'
      });
    }
    
    return res.status(500).json({ 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

module.exports = {
  initiatePayment,
  verifyTransaction,
  getAllTransactions,
  createTerminal,
  getAllTerminals,
  handleSquadWebhook,
}; 