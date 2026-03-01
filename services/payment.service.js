const {
  asyncErrorHandler,
  ErrorResponse,
} = require('../middlewares/error/error');
const logger = require('../utils/logger');
const { paymentModel } = require('../models');
const { loyaltyCoinModel } = require('../models/loyaltyPoints');
const { statusCode } = require('../utils/statusCode');
const { paginate } = require('../utils/paginate');
const { sendEmail } = require('../config/mail.config');
const { SubRooms } = require('../models/rooms.schema');
const BookingLog = require('../models/bookingLog.schema.js');
const { overnightBooking, daypassBooking } = require('../models/overnight.booking.schema');
const BookingLogger = require('../services/bookingLogger.service');
const Guest = require('../models/guest.schema');
const { processGuestVisit } = require('../utils/guestManager');
const { deductVoucherBalance } = require('../utils/voucherWallet');
const {
  checkRoomAvailability,
  checkMultiNightAvailability,
} = require('../utils/availabilityChecker');
const { normalizeRoomDetails } = require('../utils/nightlyAssignments');

function formatDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate();
  const v = day % 100;
  const suffix =
    (v - 20) % 10 === 1
      ? 'st'
      : (v - 20) % 10 === 2
        ? 'nd'
        : (v - 20) % 10 === 3
          ? 'rd'
          : v === 1
            ? 'st'
            : v === 2
              ? 'nd'
              : v === 3
                ? 'rd'
                : 'th';
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day}${suffix},${month.toLowerCase()} ${year}`;
}

const formatPrice = (price) => {
  const priceNumber = Number(price);
  return priceNumber.toLocaleString(); // Format the price with commas
};

const calculateNumberOfNights = (visitDate, endDate) => {
  const visitDateObj = new Date(visitDate);
  const endDateObj = new Date(endDate);
  const numberOfNights = Math.floor(
    (endDateObj - visitDateObj) / (1000 * 60 * 60 * 24)
  );
  // console.log(numberOfNights);
  return numberOfNights;
};
const counting = (guestCount) => {
  const numChildren = guestCount?.ages?.filter((age) =>
    age.includes('child')
  ).length;
  const numToddlers = guestCount?.ages?.filter((age) =>
    age.includes('toddler')
  ).length;
  const numInfants = guestCount?.ages?.filter((age) =>
    age.includes('infant')
  ).length;

  return {
    adults: guestCount?.adults,
    children: numChildren,
    toddlers: numToddlers,
    infants: numInfants,
  };
};

const isSuccessfulPaymentStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'success' || normalized === 'confirmed';
};

const applyVoucherDeductionForPayment = async (paymentDoc) => {
  if (!paymentDoc || paymentDoc.voucherDeducted) return;
  if (!isSuccessfulPaymentStatus(paymentDoc.status)) return;

  const voucherUsed = Number(paymentDoc.voucher || 0);
  const voucherCode = String(paymentDoc.voucherCode || '').trim();
  if (voucherUsed <= 0 || !voucherCode) return;

  const deductionResult = await deductVoucherBalance({
    voucherCode,
    voucherUsed,
  });

  if (deductionResult.deducted) {
    paymentDoc.voucherDeducted = true;
    paymentDoc.voucherDeductedAmount = Number(
      deductionResult.deductedAmount || voucherUsed
    );
    await paymentDoc.save();
  }
};

const create = asyncErrorHandler(async (req, res) => {
  let createDaypass;
  try {
    logger.info('Processing payment request', { requestBody: req.body });
    const guestDetails = JSON.parse(req.body.guestDetails);
    let roomDetails = JSON.parse(req.body.roomDetails);
    const bookingInfo = req.body.bookingInfo
      ? JSON.parse(req.body.bookingInfo)
      : null;

    if (!guestDetails || !roomDetails) {
      logger.error('Invalid payment data', { guestDetails, roomDetails });
      throw new ErrorResponse('Invalid payment data', 400);
    }

    roomDetails = normalizeRoomDetails(roomDetails);
    let availabilityCheck;

    if (roomDetails.multiNightSelections) {
      availabilityCheck = await checkMultiNightAvailability(
        roomDetails.multiNightSelections,
        { excludeBookingRef: req.body.ref }
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
        roomDetails.endDate,
        { excludeBookingRef: req.body.ref }
      );
    }

    if (availabilityCheck && !availabilityCheck.available) {
      logger.error('Payment blocked due to room unavailability', {
        email: guestDetails.email,
        conflicts: availabilityCheck.conflicts,
        message: availabilityCheck.message,
      });

      return res.status(409).json({
        success: false,
        message: availabilityCheck.message,
        conflicts: availabilityCheck.conflicts,
        error: 'ROOM_NOT_AVAILABLE',
      });
    }

    const totalGuests = roomDetails?.visitDate
      ? roomDetails?.selectedRooms?.[0]?.guestCount?.adults +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).children +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants
      : bookingInfo?.adultsAlcoholic +
      bookingInfo?.adultsNonAlcoholic +
      bookingInfo?.Nanny +
      bookingInfo?.childTotal;

    // Create payment record
    createDaypass = await paymentModel.create(req.body);

    if (!createDaypass) {
      logger.error('Failed to create payment record');
      throw new ErrorResponse('Failed To Create Payment', 404);
    }

    await applyVoucherDeductionForPayment(createDaypass);

    const bookingRef = req.body.ref || createDaypass.ref || String(createDaypass._id);

    // Create booking log for successful payment
    try {
      await BookingLogger.logBookingAttempt({
        bookingId: bookingRef,
        userId: guestDetails.email,
        status: 'success', // Assuming payment success means booking attempt is successful
        paymentStatus: 'success',
        paymentGateway: 'Paystack', // Or paymentGateway from req.body if available
        paymentId: createDaypass.paymentId,
        amount: createDaypass.amount,
        currency: createDaypass.currency,
        bookingDetails: req.body, // Log the raw request body for details
        requestPayload: req.body,
        ipAddress: req.ip || 'Unknown',
        userAgent: req.get('User-Agent') || 'Unknown',
      });
      logger.info('Successful payment booking log created', {
        bookingId: bookingRef,
      });
    } catch (bookingLogError) {
      logger.error('Failed to create successful payment booking log', {
        error: bookingLogError.message,
        paymentId: createDaypass._id,
      });
      // Log payment success but booking failure using the dedicated service
      try {
        await BookingLogger.logPaymentSuccessBookingFailure(
          { ...createDaypass.toObject(), bookingId: bookingRef },
          bookingLogError
        );
        logger.info('Logged payment success, booking failed', {
          paymentId: createDaypass._id,
        });
      } catch (logError) {
        logger.error('Failed to log payment success/booking failure', {
          originalError: bookingLogError.message,
          loggingError: logError.message,
        });
      }
      // Throw error to indicate booking process failed despite payment success
      throw new ErrorResponse('Payment successful but booking failed', 500);
    }

    // Generate loyalty points and update guest record
    try {
      let amount = createDaypass.amount;
      let email = guestDetails.email;

      const currentStatusCheck = (createDaypass.status || '').toLowerCase();
      if (['success', 'confirmed'].includes(currentStatusCheck)) {
        // Loyalty logic
        let loyaltyRecord = await loyaltyCoinModel.findOne({ email });
        if (loyaltyRecord) {
          loyaltyRecord.totalSpent += Number(amount);
          loyaltyRecord.points = Math.floor(loyaltyRecord.totalSpent / 10000);
          loyaltyRecord.redeemable = loyaltyRecord.points >= 50;
          await loyaltyRecord.save();
        } else {
          const points = Math.floor(amount / 10000);
          const newLoyalty = new loyaltyCoinModel({
            email,
            totalSpent: amount,
            points: points,
            redeemable: points >= 50,
          });
          await newLoyalty.save();
        }

        // Consolidated Guest processing
        const isOvernight = !!(roomDetails?.visitDate || roomDetails?.selectedRooms);
        const guestVisitData = {
          ...guestDetails,
          name: req.body.name || `${guestDetails.firstname || ''} ${guestDetails.lastname || ''}`.trim(),
          email: guestDetails.email
        };
        await processGuestVisit(guestVisitData, isOvernight);
      }
    } catch (err) {
      logger.error('Error while processing loyalty/guest on payment create:', err);
    }

    // Send emails (keep in try catch as before)
    const emailContext = {
      name: req.body.name,
      email: guestDetails.email,
      id: req.body.ref,
      bookingType:
        roomDetails?.selectedRooms?.map((room) => room.title).join(', ') ||
        'Day Pass',
      checkIn: roomDetails?.visitDate
        ? formatDate(roomDetails?.visitDate)
        : roomDetails?.startDate
          ? formatDate(roomDetails?.startDate)
          : roomDetails?.startDate,
      checkOut: roomDetails?.endDate
        ? formatDate(roomDetails?.endDate)
        : roomDetails?.startDate
          ? formatDate(roomDetails?.startDate)
          : roomDetails?.startDate,
      numberOfGuests: roomDetails?.visitDate
        ? `${roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0
        } Adults, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).children ?? 0
        } Children ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers ?? 0
        } Toddlers ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ?? 0
        } Infants`
        : bookingInfo
          ? `${bookingInfo?.adultsAlcoholic} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic} Adults Non Alcoholic, ${bookingInfo?.Nanny} Nanny, ${bookingInfo?.childTotal} Child`
          : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0
          } Children`,
      numberOfNights: roomDetails?.visitDate
        ? calculateNumberOfNights(roomDetails?.visitDate, roomDetails?.endDate)
        : 'Day Pass',
      extras:
        roomDetails?.visitDate && roomDetails?.finalData
          ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
          : roomDetails?.startDate && roomDetails?.extras
            ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
            : 'No Extras',
      subTotal: formatPrice(req.body.subTotal),
      multiNightDiscount: req.body.discount.toLocaleString(),
      clubMemberDiscount: req.body.voucher,
      multiNightDiscountAvailable: req.body.multiNightDiscount
        ? req.body.multiNightDiscount
        : 0,
      vat: formatPrice(req.body.vat),
      totalCost: formatPrice(req.body.totalCost),
      roomsPrice:
        req.body.roomsPrice == 'Daypass'
          ? req.body.roomsPrice
          : formatPrice(req.body.roomsPrice),
      extrasPrice: formatPrice(req.body.extrasPrice),
      roomsDiscount:
        req.body.roomsDiscount == 'Daypass'
          ? req.body.roomsDiscount
          : formatPrice(req.body.roomsDiscount),
      discountApplied: req.body.discountApplied
        ? req.body.discountApplied == 'true'
          ? 'Yes'
          : 'No'
        : '',
      voucherApplied: req.body.voucherApplied
        ? req.body.voucherApplied == 'true'
          ? 'Yes'
          : 'No'
        : '',
      priceAfterVoucher: req.body.priceAfterVoucher
        ? formatPrice(req.body.priceAfterVoucher)
        : formatPrice(req.body.subTotal),
      priceAfterDiscount: req.body.priceAfterDiscount
        ? formatPrice(req.body.priceAfterDiscount)
        : formatPrice(req.body.subTotal),
      totalGuests: totalGuests,
    };

    try {
      const currentStatus = (req.body.status || '').toLowerCase();
      console.log(`[Payment] Processing email for status: ${req.body.status}`);

      if (currentStatus === 'pending') {
        await sendEmail(
          guestDetails.email,
          'Your Booking Is Pending',
          'pending_payment',
          emailContext
        );
      } else if (currentStatus === 'success' || currentStatus === 'confirmed') {
        await sendEmail(
          guestDetails.email,
          'Your Booking Is Confirmed',
          'confirmation',
          emailContext
        );
      }
    } catch (emailError) {
      logger.error('Failed to send emails', { error: emailError.message });
      // Continue execution even if email sending fails
    }

    // Auto-create or update guest record so the admin Guests page stays in sync
    try {
      const guestName = createDaypass.name || `${guestDetails.firstname || ''} ${guestDetails.lastname || ''}`.trim();
      const existingGuest = await Guest.findOne({ email: guestDetails.email });
      if (existingGuest) {
        // Determine if this is an overnight or daypass booking
        const isOvernight = !!(roomDetails?.visitDate || roomDetails?.selectedRooms);
        if (isOvernight) {
          existingGuest.visitMetrics.overnightStays = (existingGuest.visitMetrics?.overnightStays || 0) + 1;
        } else {
          existingGuest.visitMetrics.dayVisits = (existingGuest.visitMetrics?.dayVisits || 0) + 1;
        }
        if (guestName) existingGuest.name = guestName;
        if (guestDetails.phone || guestDetails.mobile) existingGuest.mobile = guestDetails.phone || guestDetails.mobile;
        if (guestDetails.gender) existingGuest.gender = guestDetails.gender;
        if (guestDetails.dateOfBirth) existingGuest.keyDates.dob = guestDetails.dateOfBirth;
        await existingGuest.save();
      } else {
        const isOvernight = !!(roomDetails?.visitDate || roomDetails?.selectedRooms);
        await Guest.create({
          name: guestName || 'N/A',
          gender: guestDetails.gender || 'N/A',
          email: guestDetails.email,
          mobile: guestDetails.phone || guestDetails.mobile || 'N/A',
          member: false,
          birthdayReminded: false,
          visitMetrics: {
            dayVisits: isOvernight ? 0 : 1,
            overnightStays: isOvernight ? 1 : 0,
          },
          preferences: {
            dietaryRequirements: guestDetails.para ? [guestDetails.para] : [],
            drinkPreferences: guestDetails.drinkPreferences ? [guestDetails.drinkPreferences] : [],
            pastExtras: [],
          },
          keyDates: {
            dob: guestDetails.dateOfBirth || undefined,
            anniversary: guestDetails.anniversary || undefined,
          },
        });
      }
      logger.info('Guest record auto-created/updated', { email: guestDetails.email });
    } catch (guestErr) {
      logger.error('Failed to auto-create guest record', { error: guestErr.message, email: guestDetails?.email });
      // Don't fail the payment creation; this is a best-effort side effect
    }

    // Only send success response if booking log was created successfully
    res.status(statusCode.accepted).json(createDaypass);
  } catch (error) {
    logger.error('Error during payment creation or subsequent process', {
      error: error.message,
      stack: error.stack,
      paymentId: createDaypass?._id || 'N/A', // Log payment ID if available
    });

    // Log failed booking process if not already logged as payment success/booking failure
    if (error.message !== 'Payment successful but booking failed') {
      try {
        await BookingLogger.logBookingAttempt({
          bookingId: req.body.ref || 'N/A', // Use ref or N/A
          userId: req.body.guestDetails
            ? JSON.parse(req.body.guestDetails).email
            : 'Unknown',
          status: 'failed',
          paymentStatus: createDaypass?.status || 'failed',
          paymentGateway: 'Paystack',
          paymentId: createDaypass?.paymentId || 'N/A',
          amount: createDaypass?.amount || req.body.amount || 0,
          currency: createDaypass?.currency || req.body.currency || 'N/A',
          errorDetails: {
            errorMessage: error.message,
            stackTrace: error.stack,
            failedStep: 'Payment Processing',
          },
          requestPayload: req.body,
          ipAddress: req.ip || 'Unknown',
          userAgent: req.get('User-Agent') || 'Unknown',
        });
        logger.info('Logged general failed booking process', {
          bookingId: req.body.ref || 'N/A',
        });
      } catch (logError) {
        logger.error('Failed to create general failed booking log', {
          originalError: error.message,
          loggingError: logError.message,
        });
      }
    }

    // Re-throw the error after logging
    throw error;
  }
});

const getAll = asyncErrorHandler(async (req, res) => {
  let allDaypass = await paymentModel.find({}).sort({ createdAt: -1 });
  if (allDaypass.length > 0) {
    res.status(statusCode.accepted).json(allDaypass);
  } else {
    throw new ErrorResponse('No Payment Found', 404);
  }
});

const getPaginatedPayments = asyncErrorHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paginate(paymentModel, {}, { page, limit });
  res.status(statusCode.accepted).json(result);
});

const getSingle = asyncErrorHandler(async (req, res) => {
  let daypass = await paymentModel.findById(req.params.id);
  if (daypass) {
    res.status(statusCode.accepted).json(daypass);
  } else {
    throw new ErrorResponse('No Payment Found', 404);
  }
});
const deletePaymentAll = asyncErrorHandler(async (req, res) => {
  await paymentModel.deleteMany({});
  res.status(statusCode.accepted).json({ message: 'All Payments Deleted' });
});

const deletByBookingId = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  let daypass = await paymentModel.findOneAndDelete({ ref: id });
  if (daypass) {
    res.status(statusCode.accepted).json({ message: 'Payment Deleted' });
  } else {
    throw new ErrorResponse('No Payment Found', 404);
  }
});

const getByBookingId = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;

  console.log('🔍 PAYMENT: getByBookingId called with id:', id);
  console.log('🔍 PAYMENT: id type:', typeof id);

  let daypass = await paymentModel.find({ ref: id });

  console.log(
    '🔍 PAYMENT: Database query result:',
    daypass ? `${daypass.length} records found` : 'No records found'
  );
  if (daypass && daypass.length > 0) {
    console.log(
      '✅ PAYMENT: Found payment records:',
      daypass.map((p) => ({
        id: p._id,
        ref: p.ref,
        status: p.status,
        method: p.method,
      }))
    );
  } else {
    console.log('❌ PAYMENT: No payment found with ref:', id);
    // Let's also check if there are any payments with similar patterns
    const allPayments = await paymentModel.find({}).limit(5);
    console.log(
      '🔍 PAYMENT: Sample of existing refs:',
      allPayments.map((p) => p.ref)
    );
  }

  if (daypass) {
    console.log('✅ PAYMENT: Returning payment data for id:', id);
    res.status(statusCode.accepted).json(daypass);
  } else {
    console.log('❌ PAYMENT: Throwing 404 error for id:', id);
    throw new ErrorResponse('No Payment Found', 404);
  }
});

const confirm = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const { bank } = req.body;
  let payment = await paymentModel.findOne({ ref });
  if (payment) {
    payment.status = 'Success'; // Update the status to confirm
    payment.method = `Bank Transfer ${bank}`;
    await payment.save();
    await applyVoucherDeductionForPayment(payment);

    // Also update corresponding overnight booking status if it exists
    try {
      await overnightBooking.findOneAndUpdate(
        { shortId: ref },
        { status: 'Confirmed' }
      );
      await daypassBooking.findOneAndUpdate(
        { shortId: ref },
        { status: 'Confirmed' }
      );
    } catch (err) {
      logger.error('Failed to update overnight booking status on bank transfer confirm:', err);
    }

    if (payment) {
      let amount = payment.amount;
      const loyaltyGuestDetails = JSON.parse(payment.guestDetails);
      let email = loyaltyGuestDetails.email;
      let loyaltyRecord = await loyaltyCoinModel.findOne({ email });
      if (loyaltyRecord) {
        loyaltyRecord.totalSpent += Number(amount);
        loyaltyRecord.points = Math.floor(loyaltyRecord.totalSpent / 10000);
        loyaltyRecord.redeemable = loyaltyRecord.points >= 50;
        await loyaltyRecord.save();
        logger.info('Loyalty points updated', {
          email,
          totalSpent: loyaltyRecord.totalSpent,
          points: loyaltyRecord.points,
        });
      } else {
        const points = Math.floor(amount / 10000);
        const newLoyalty = new loyaltyCoinModel({
          email,
          totalSpent: amount,
          points: points,
          redeemable: points >= 50,
        });
        await newLoyalty.save();
        logger.info('Loyalty record created', {
          email,
          totalSpent: amount,
          points: newLoyalty.points,
        });
      }
    }

    res.status(statusCode.accepted).json(payment);
    const guestDetails = JSON.parse(payment.guestDetails);
    const roomDetails = JSON.parse(payment.roomDetails);
    const bookingInfo = payment.bookingInfo
      ? JSON.parse(payment.bookingInfo)
      : null;

    // Auto-create or update guest record on bank transfer confirmation
    try {
      const isOvernight = !!(roomDetails?.visitDate || roomDetails?.selectedRooms);
      const guestVisitData = {
        ...guestDetails,
        name: payment.name || `${guestDetails.firstname || ''} ${guestDetails.lastname || ''}`.trim(),
        email: guestDetails.email
      };
      await processGuestVisit(guestVisitData, isOvernight);
      logger.info('Guest record consolidated via guestManager on bank transfer confirmation', { email: guestDetails.email });
    } catch (guestErr) {
      logger.error('Failed to process guest record via guestManager on bank transfer confirmation', { error: guestErr.message, email: guestDetails?.email });
    }

    const totalGuests = roomDetails?.visitDate
      ? roomDetails?.selectedRooms?.[0]?.guestCount?.adults +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).children +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants
      : bookingInfo?.adultsAlcoholic +
      bookingInfo?.adultsNonAlcoholic +
      bookingInfo?.Nanny +
      bookingInfo?.childTotal;

    const emailContext = {
      name: payment.name,
      email: guestDetails.email,
      id: payment.ref,
      bookingType:
        roomDetails?.selectedRooms?.map((room) => room.title).join(', ') ||
        'Day Pass',
      checkIn: roomDetails?.visitDate
        ? formatDate(roomDetails?.visitDate)
        : roomDetails?.startDate
          ? formatDate(roomDetails?.startDate)
          : roomDetails?.startDate,
      checkOut: roomDetails?.endDate
        ? formatDate(roomDetails?.endDate)
        : roomDetails?.startDate
          ? formatDate(roomDetails?.startDate)
          : roomDetails?.startDate,
      numberOfGuests: roomDetails?.visitDate
        ? `${roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0
        } Adults, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).children ?? 0
        } Children ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers ?? 0
        } Toddlers ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ?? 0
        } Infants`
        : bookingInfo
          ? `${bookingInfo?.adultsAlcoholic} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic} Adults Non Alcoholic, ${bookingInfo?.Nanny} Nanny, ${bookingInfo?.childTotal} Child`
          : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0
          } Children`,
      numberOfNights: roomDetails?.visitDate
        ? calculateNumberOfNights(roomDetails?.visitDate, roomDetails?.endDate)
        : 'Day Pass',
      extras:
        roomDetails?.visitDate && roomDetails?.finalData
          ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
          : roomDetails?.startDate && roomDetails?.extras
            ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
            : 'No Extras',
      subTotal: formatPrice(payment.subTotal),
      multiNightDiscount: payment.discount.toLocaleString(),
      clubMemberDiscount: payment.voucher,
      multiNightDiscountAvailable: payment.multiNightDiscount
        ? payment.multiNightDiscount
        : 0,
      vat: formatPrice(payment.vat),
      totalCost: formatPrice(payment.totalCost),
      roomsPrice: payment.roomsPrice
        ? payment.roomsPrice == 'Daypass'
          ? payment.roomsPrice
          : formatPrice(payment.roomsPrice)
        : '',
      extrasPrice: payment.extrasPrice ? formatPrice(payment.extrasPrice) : '',
      roomsDiscount: payment.roomsDiscount
        ? payment.roomsDiscount == 'Daypass'
          ? payment.roomsDiscount
          : formatPrice(payment.roomsDiscount)
        : '',
      discountApplied: payment.discountApplied
        ? payment.discountApplied == 'true'
          ? 'Yes'
          : 'No'
        : '',
      voucherApplied: payment.voucherApplied
        ? payment.voucherApplied == 'true'
          ? 'Yes'
          : 'No'
        : '',
      priceAfterVoucher: payment.priceAfterVoucher
        ? formatPrice(payment.priceAfterVoucher)
        : '',
      priceAfterDiscount: payment.priceAfterDiscount
        ? formatPrice(payment.priceAfterDiscount)
        : '',
      totalGuests: totalGuests,
    };
    sendEmail(
      guestDetails.email,
      'Your Booking Is Confirmed',
      'confirmation',
      emailContext
    );
  } else {
    throw new ErrorResponse('Payment Not Found', 404);
  }
});

const cancel = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  // Find all payments with this ref
  const payments = await paymentModel.find({ ref });
  if (payments && payments.length > 0) {
    for (const payment of payments) {
      payment.status = 'Cancelled';
      await payment.save();
    }
    res
      .status(statusCode.accepted)
      .json({
        message: 'All payments with this ref have been cancelled',
        count: payments.length,
      });
    // Use the last payment for email context
    const lastPayment = payments[payments.length - 1];
    const guestDetails = JSON.parse(lastPayment.guestDetails);
    const roomDetails = JSON.parse(lastPayment.roomDetails);
    const bookingInfo = lastPayment.bookingInfo
      ? JSON.parse(lastPayment.bookingInfo)
      : null;
    const totalGuests = roomDetails?.visitDate
      ? roomDetails?.selectedRooms?.[0]?.guestCount?.adults +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).children +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
      counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants
      : bookingInfo?.adultsAlcoholic +
      bookingInfo?.adultsNonAlcoholic +
      bookingInfo?.Nanny +
      bookingInfo?.childTotal;

    // Add VAT/subtotal fallback logic as in squad.service.js
    if (
      (!lastPayment.vat || isNaN(parseFloat(lastPayment.vat))) &&
      lastPayment.totalCost &&
      !isNaN(parseFloat(lastPayment.totalCost))
    ) {
      const calculatedSubTotal = lastPayment.totalCost / 1.125;
      lastPayment.vat = lastPayment.totalCost - calculatedSubTotal;
      if (!lastPayment.subTotal || isNaN(parseFloat(lastPayment.subTotal))) {
        lastPayment.subTotal = calculatedSubTotal;
      }
    }
    // Accept both numbers and numeric strings
    function isValidNumber(val) {
      return !isNaN(parseFloat(val)) && isFinite(val);
    }
    const emailContext = {
      name: lastPayment.name || 'N/A',
      email: guestDetails.email || 'N/A',
      id: lastPayment.ref || 'N/A',
      bookingType:
        roomDetails?.selectedRooms?.map((room) => ` ${room.title}`) ||
        'Day Pass',
      checkIn: roomDetails?.visitDate
        ? `${formatDate(roomDetails?.visitDate)}, (2pm)`
        : roomDetails?.startDate
          ? `${roomDetails?.startDate}, (12noon)`
          : 'N/A',
      checkOut: roomDetails?.endDate
        ? `${formatDate(roomDetails?.endDate)}, (11am)`
        : roomDetails?.startDate
          ? `${roomDetails?.startDate}, (6pm)`
          : 'N/A',
      numberOfGuests:
        roomDetails?.visitDate && roomDetails?.selectedRooms?.[0]?.guestCount
          ? `${roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0
          } Adults, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).children ??
          0
          } Children, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers ??
          0
          } Toddlers, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ?? 0
          } Infants`
          : bookingInfo
            ? `${bookingInfo?.adultsAlcoholic ?? 0} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic ?? 0
            } Adults Non Alcoholic, ${bookingInfo?.Nanny ?? 0} Nanny, ${bookingInfo?.childTotal ?? 0
            } Child`
            : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0
            } Children`,
      numberOfNights: roomDetails?.visitDate
        ? calculateNumberOfNights(roomDetails?.visitDate, roomDetails?.endDate)
        : 'Day Pass',
      extras:
        roomDetails?.visitDate &&
          roomDetails?.finalData &&
          roomDetails?.finalData.length > 0
          ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`).join(', ')
          : roomDetails?.startDate &&
            roomDetails?.extras &&
            roomDetails?.extras.length > 0
            ? roomDetails?.extras?.map((extra) => ` ${extra.title}`).join(', ')
            : 'No Extras',
      subTotal: isValidNumber(lastPayment.subTotal)
        ? formatPrice(lastPayment.subTotal)
        : 'N/A',
      multiNightDiscount: isValidNumber(lastPayment.discount)
        ? formatPrice(lastPayment.discount)
        : 'N/A',
      clubMemberDiscount: isValidNumber(lastPayment.voucher)
        ? formatPrice(lastPayment.voucher)
        : 'N/A',
      multiNightDiscountAvailable: isValidNumber(lastPayment.multiNightDiscount)
        ? formatPrice(lastPayment.multiNightDiscount)
        : 'N/A',
      vat: isValidNumber(lastPayment.vat)
        ? formatPrice(lastPayment.vat)
        : 'N/A',
      totalCost: isValidNumber(lastPayment.totalCost)
        ? formatPrice(lastPayment.totalCost)
        : 'N/A',
      roomsPrice: lastPayment.roomsPrice
        ? lastPayment.roomsPrice == 'Daypass'
          ? lastPayment.roomsPrice
          : formatPrice(lastPayment.roomsPrice)
        : 'N/A',
      extrasPrice: isValidNumber(lastPayment.extrasPrice)
        ? formatPrice(lastPayment.extrasPrice)
        : 'N/A',
      roomsDiscount: isValidNumber(lastPayment.roomsDiscount)
        ? formatPrice(lastPayment.roomsDiscount)
        : 'N/A',
      discountApplied: lastPayment.discountApplied
        ? lastPayment.discountApplied == 'true'
          ? 'Yes'
          : 'No'
        : 'N/A',
      voucherApplied: lastPayment.voucherApplied
        ? lastPayment.voucherApplied == 'true'
          ? 'Yes'
          : 'No'
        : 'N/A',
      priceAfterVoucher: isValidNumber(lastPayment.priceAfterVoucher)
        ? formatPrice(lastPayment.priceAfterVoucher)
        : isValidNumber(lastPayment.totalCost)
          ? formatPrice(lastPayment.totalCost)
          : 'N/A',
      priceAfterDiscount: isValidNumber(lastPayment.priceAfterDiscount)
        ? formatPrice(lastPayment.priceAfterDiscount)
        : isValidNumber(lastPayment.totalCost)
          ? formatPrice(lastPayment.totalCost)
          : 'N/A',
      totalGuests: isValidNumber(totalGuests) ? totalGuests : 'N/A',
    };
    console.log(
      'Attempting to send cancellation email to:',
      guestDetails.email
    );
    console.log('Email context:', emailContext);
    await sendEmail(
      guestDetails.email,
      'Your Booking Has Been Cancelled',
      'cancellation',
      emailContext
    );
    sendEmail(
      'bookings@jarabeachresort.com',
      'Booking Cancelled',
      'cancellation',
      emailContext
    );
  } else {
    throw new ErrorResponse('Booking Not Found', 404);
  }
});
const updatePayment = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const payment = await paymentModel.findOne({ ref });
  if (!payment) {
    throw new ErrorResponse('Payment not found', 404);
  }

  const previousStatus = payment.status;
  Object.assign(payment, req.body);

  await payment.save();
  await applyVoucherDeductionForPayment(payment);
  res.status(200).json(payment);

  // Auto-create or update guest record when status is changed to Success
  if (req.body.status === 'Success' && previousStatus !== 'Success') {
    try {
      const roomDetailsForGuest = JSON.parse(payment.roomDetails);
      const guestDetailsForGuest = JSON.parse(payment.guestDetails);
      const guestName = payment.name || `${guestDetailsForGuest.firstname || ''} ${guestDetailsForGuest.lastname || ''}`.trim();
      const existingGuest = await Guest.findOne({ email: guestDetailsForGuest.email });
      const isOvernight = !!(roomDetailsForGuest?.visitDate || roomDetailsForGuest?.selectedRooms);
      if (existingGuest) {
        if (isOvernight) {
          existingGuest.visitMetrics.overnightStays = (existingGuest.visitMetrics?.overnightStays || 0) + 1;
        } else {
          existingGuest.visitMetrics.dayVisits = (existingGuest.visitMetrics?.dayVisits || 0) + 1;
        }
        if (guestName) existingGuest.name = guestName;
        if (guestDetailsForGuest.phone || guestDetailsForGuest.mobile) existingGuest.mobile = guestDetailsForGuest.phone || guestDetailsForGuest.mobile;
        if (guestDetailsForGuest.gender) existingGuest.gender = guestDetailsForGuest.gender;
        if (guestDetailsForGuest.dateOfBirth) existingGuest.keyDates.dob = guestDetailsForGuest.dateOfBirth;
        await existingGuest.save();
      } else {
        await Guest.create({
          name: guestName || 'N/A',
          gender: guestDetailsForGuest.gender || 'N/A',
          email: guestDetailsForGuest.email,
          mobile: guestDetailsForGuest.phone || guestDetailsForGuest.mobile || 'N/A',
          member: false,
          birthdayReminded: false,
          visitMetrics: {
            dayVisits: isOvernight ? 0 : 1,
            overnightStays: isOvernight ? 1 : 0,
          },
          preferences: {
            dietaryRequirements: guestDetailsForGuest.para ? [guestDetailsForGuest.para] : [],
            drinkPreferences: guestDetailsForGuest.drinkPreferences ? [guestDetailsForGuest.drinkPreferences] : [],
            pastExtras: [],
          },
          keyDates: {
            dob: guestDetailsForGuest.dateOfBirth || undefined,
            anniversary: guestDetailsForGuest.anniversary || undefined,
          },
        });
      }
      logger.info('Guest record auto-created/updated on admin status change', { email: guestDetailsForGuest.email });
    } catch (guestErr) {
      logger.error('Failed to auto-create guest record on admin status change', { error: guestErr.message });
    }
  }

  const roomDetails = JSON.parse(payment.roomDetails);
  const guestDetails = JSON.parse(payment.guestDetails);
  const bookingInfo = payment.bookingInfo
    ? JSON.parse(payment.bookingInfo)
    : null;
  const totalGuests = roomDetails?.visitDate
    ? roomDetails?.selectedRooms?.[0]?.guestCount?.adults +
    counting(roomDetails?.selectedRooms?.[0]?.guestCount).children +
    counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
    counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants
    : bookingInfo?.adultsAlcoholic +
    bookingInfo?.adultsNonAlcoholic +
    bookingInfo?.Nanny +
    bookingInfo?.childTotal;

  const emailContext = {
    name: payment.name,
    email: guestDetails.email,
    id: payment.ref,
    bookingType:
      roomDetails?.selectedRooms && roomDetails?.selectedRooms.length > 0
        ? roomDetails.selectedRooms.map((room) => room.title).join(', ')
        : 'Day Pass',
    checkIn: roomDetails?.visitDate
      ? `${formatDate(roomDetails?.visitDate)}`
      : `${formatDate(roomDetails?.startDate)}`,
    checkOut: roomDetails?.endDate
      ? `${formatDate(roomDetails?.endDate)}`
      : `${formatDate(roomDetails?.startDate)}`,
    numberOfGuests: roomDetails?.visitDate
      ? `${roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0} Adults, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).children ?? 0
      } Children ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers ?? 0
      } Toddlers ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ?? 0
      } Infants`
      : bookingInfo
        ? `${bookingInfo?.adultsAlcoholic} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic} Adults Non Alcoholic, ${bookingInfo?.Nanny} Nanny, ${bookingInfo?.childTotal} Child`
        : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0
        } Children`,
    numberOfNights: roomDetails?.visitDate
      ? calculateNumberOfNights(roomDetails?.visitDate, roomDetails?.endDate)
      : 'Day Pass',
    extras:
      roomDetails?.visitDate && roomDetails?.finalData
        ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
        : roomDetails?.startDate && roomDetails?.extras
          ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
          : 'No Extras',
    subTotal: formatPrice(payment.subTotal),
    multiNightDiscount: payment.discount.toLocaleString(),
    clubMemberDiscount: payment.voucher,
    multiNightDiscountAvailable: payment.multiNightDiscount
      ? payment.multiNightDiscount
      : 0,
    vat: formatPrice(payment.vat),
    totalCost: formatPrice(payment.totalCost),
    previousCost: payment.previousCost.toLocaleString(),
    differenceToPay:
      payment.previousPaymentStatus == 'Pending'
        ? formatPrice(payment.totalCost)
        : parseFloat(payment.totalCost) - parseFloat(payment.previousCost) > 0
          ? (
            parseFloat(payment.totalCost) - parseFloat(payment.previousCost)
          ).toLocaleString()
          : 0,
    roomsPrice: payment.roomsPrice
      ? payment.roomsPrice == 'Daypass'
        ? payment.roomsPrice
        : formatPrice(payment.roomsPrice)
      : '',
    extrasPrice: payment.extrasPrice ? formatPrice(payment.extrasPrice) : '',
    roomsDiscount: payment.roomsDiscount
      ? payment.roomsDiscount == 'Daypass'
        ? payment.roomsDiscount
        : formatPrice(payment.roomsDiscount)
      : '',
    discountApplied: payment.discountApplied
      ? payment.discountApplied == 'true'
        ? 'Yes'
        : 'No'
      : '',
    voucherApplied: payment.voucherApplied
      ? payment.voucherApplied == 'true'
        ? 'Yes'
        : 'No'
      : '',
    priceAfterVoucher: payment.priceAfterVoucher
      ? formatPrice(payment.priceAfterVoucher)
      : '',
    priceAfterDiscount: payment.priceAfterDiscount
      ? formatPrice(payment.priceAfterDiscount)
      : '',
    totalGuests: totalGuests,
  };
  if (req.body.status === 'Pending') {
    sendEmail(
      guestDetails.email,
      'Your Booking Is Updated',
      'manage_pending',
      emailContext
    );
    sendEmail(
      'bookings@jarabeachresort.com',
      'Booking Updated',
      'manage_pending',
      emailContext
    );
  } else if (req.body.status === 'Success') {
    sendEmail(
      guestDetails.email,
      'Your Booking Is Updated',
      'manage_success',
      emailContext
    );
    sendEmail(
      'bookings@jarabeachresort.com',
      'Booking Updated',
      'manage_success',
      emailContext
    );
  } else if (req.body.status === 'Cancelled' || req.body.status === 'Cancelled by Admin') {
    sendEmail(
      guestDetails.email,
      'Your Booking Has Been Cancelled',
      'cancellation',
      emailContext
    );
    sendEmail(
      'bookings@jarabeachresort.com',
      'Booking Cancelled',
      'cancellation',
      emailContext
    );
  }
});
module.exports = {
  create,
  getAll,
  getPaginatedPayments,
  getByBookingId,
  getSingle,
  confirm,
  cancel,
  updatePayment,
  deletePaymentAll,
  deletByBookingId,
};
