const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const logger = require("../utils/logger");
const { paymentModel } = require("../models");
const { loyaltyCoinModel } = require("../models/loyaltyPoints");
const { statusCode } = require("../utils/statusCode");
const { sendEmail } = require("../config/mail.config");
const { SubRooms } = require("../models/rooms.schema");
const BookingLog = require('../models/bookingLog.schema.js');
const BookingLogger = require('../services/bookingLogger.service');

function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: "numeric", month: "long", day: "numeric" };
  const formattedDate = date.toLocaleDateString("en-US", options);
  return formattedDate;
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
    age.includes("child")
  ).length;
  const numToddlers = guestCount?.ages?.filter((age) =>
    age.includes("toddler")
  ).length;
  const numInfants = guestCount?.ages?.filter((age) =>
    age.includes("infant")
  ).length;

  return {
    adults: guestCount?.adults,
    children: numChildren,
    toddlers: numToddlers,
    infants: numInfants,
  };
};

const create = asyncErrorHandler(async (req, res) => {
  let createDaypass;
  try {
    logger.info("Processing payment request", { requestBody: req.body });
    const guestDetails = JSON.parse(req.body.guestDetails);
    const roomDetails = JSON.parse(req.body.roomDetails);
    const bookingInfo = req.body.bookingInfo
      ? JSON.parse(req.body.bookingInfo)
      : null;

    if (!guestDetails || !roomDetails) {
      logger.error("Invalid payment data", { guestDetails, roomDetails });
      throw new ErrorResponse("Invalid payment data", 400);
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
      logger.error("Failed to create payment record");
      throw new ErrorResponse("Failed To Create Payment", 404);
    }

    // Create booking log for successful payment
    try {
      await BookingLogger.logBookingAttempt({
        bookingId: createDaypass._id,
        userId: guestDetails.email,
        status: "success", // Assuming payment success means booking attempt is successful
        paymentStatus: "success",
        paymentGateway: "Paystack", // Or paymentGateway from req.body if available
        paymentId: createDaypass.paymentId,
        amount: createDaypass.amount,
        currency: createDaypass.currency,
        bookingDetails: req.body, // Log the raw request body for details
        requestPayload: req.body,
        ipAddress: req.ip || 'Unknown',
        userAgent: req.get('User-Agent') || 'Unknown'
      });
      logger.info("Successful payment booking log created", { bookingId: createDaypass._id });
    } catch (bookingLogError) {
      logger.error("Failed to create successful payment booking log", {
        error: bookingLogError.message,
        paymentId: createDaypass._id
      });
      // Log payment success but booking failure using the dedicated service
      try {
          await BookingLogger.logPaymentSuccessBookingFailure(createDaypass, bookingLogError);
          logger.info("Logged payment success, booking failed", { paymentId: createDaypass._id });
      } catch (logError) {
          logger.error("Failed to log payment success/booking failure", { originalError: bookingLogError.message, loggingError: logError.message });
      }
      // Throw error to indicate booking process failed despite payment success
      throw new ErrorResponse("Payment successful but booking failed", 500);
    }

    // Generate loyalty points (keep in try catch as before, but ensure it doesn't prevent response if it fails)
    try {
      let amount = createDaypass.amount;
      let email = guestDetails.email;

      if (createDaypass.status === 'Success') {
        let loyaltyRecord = await loyaltyCoinModel.findOne({ email });
        if (loyaltyRecord) {
          loyaltyRecord.totalSpent += Number(amount);
          loyaltyRecord.points = Math.floor(loyaltyRecord.totalSpent / 10000);
          loyaltyRecord.redeemable = loyaltyRecord.points >= 50;
          await loyaltyRecord.save();
          logger.info("Loyalty points updated", { email, totalSpent: loyaltyRecord.totalSpent, points: loyaltyRecord.points });
        } else {
          const points = Math.floor(amount / 10000);
          const newLoyalty = new loyaltyCoinModel({
            email,
            totalSpent: amount,
            points: points,
            redeemable: points >= 50
          });
          await newLoyalty.save();
          logger.info("Loyalty record created", { email, totalSpent: amount, points: newLoyalty.points });
        }
      }
    } catch (loyaltyError) {
      logger.error("Error while generating loyalty points:", loyaltyError);
      // Continue execution even if loyalty points generation fails
    }

    // Send emails (keep in try catch as before)
    const emailContext = {
      name: req.body.name,
      email: guestDetails.email,
      id: req.body.ref,
      bookingType:
        roomDetails?.selectedRooms?.map((room) => ` ${room.title}`) ||
        "Day Pass",
      checkIn: roomDetails?.visitDate
        ? `${formatDate(roomDetails?.visitDate)}, (2pm)`
        : `${roomDetails?.startDate}, (12noon)`,
      checkOut: roomDetails?.endDate
        ? `${formatDate(roomDetails?.endDate)}, (11am)`
        : `${roomDetails?.startDate}, (6pm)`,
      numberOfGuests: roomDetails?.visitDate
        ? `${roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0
        } Adults, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).children ??
        0
        } Children ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers ??
        0
        } Toddlers ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ?? 0
        } Infants`
        : bookingInfo
          ? `${bookingInfo?.adultsAlcoholic} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic} Adults Non Alcoholic, ${bookingInfo?.Nanny} Nanny, ${bookingInfo?.childTotal} Child`
          : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0
          } Children`,
      numberOfNights: roomDetails?.visitDate
        ? calculateNumberOfNights(
          roomDetails?.visitDate,
          roomDetails?.endDate
        )
        : "Day Pass",
      extras:
        roomDetails?.visitDate && roomDetails?.finalData
          ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
          : roomDetails?.startDate && roomDetails?.extras
            ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
            : "No Extras",
      subTotal: formatPrice(req.body.subTotal), // Use req.body as original
      multiNightDiscount: req.body.discount.toLocaleString(), // Use req.body as original
      clubMemberDiscount: req.body.voucher, // Use req.body as original
      multiNightDiscountAvailable: req.body.multiNightDiscount
        ? req.body.multiNightDiscount
        : 0,
      vat: formatPrice(req.body.vat), // Use req.body as original
      totalCost: formatPrice(req.body.totalCost), // Use req.body as original
      roomsPrice:
        req.body.roomsPrice == "Daypass"
          ? req.body.roomsPrice
          : formatPrice(req.body.roomsPrice), // Use req.body as original
      extrasPrice: formatPrice(req.body.extrasPrice), // Use req.body as original
      roomsDiscount:
        req.body.roomsDiscount == "Daypass"
          ? req.body.roomsDiscount
          : formatPrice(req.body.roomsDiscount), // Use req.body as original
      discountApplied: req.body.discountApplied
        ? req.body.discountApplied == "true"
          ? "Yes"
          : "No"
        : "",
      voucherApplied: req.body.voucherApplied
        ? req.body.voucherApplied == "true"
          ? "Yes"
          : "No"
        : "",
      priceAfterVoucher: req.body.priceAfterVoucher
        ? formatPrice(req.body.priceAfterVoucher)
        : formatPrice(req.body.subTotal), // Use req.body as original
      priceAfterDiscount: req.body.priceAfterDiscount
        ? formatPrice(req.body.priceAfterDiscount)
        : formatPrice(req.body.subTotal), // Use req.body as original
      totalGuests: totalGuests,
    };

    try {
      if (req.body.status === "Pending") {
        await sendEmail(
          guestDetails.email,
          "Your Booking Is Pending",
          "pending_payment",
          emailContext
        );
        await sendEmail(
          "bookings@jarabeachresort.com",
          "New Booking Pending",
          "pending_payment",
          emailContext
        );
      }
      else if (req.body.status === "Success") {
        await sendEmail(
          guestDetails.email,
          "Your Booking Is Confirmed",
          "confirmation",
          emailContext
        );
        await sendEmail(
          "bookings@jarabeachresort.com",
          "New Booking Confirmed",
          "confirmation",
          emailContext
        );
      }
    } catch (emailError) {
      logger.error("Failed to send emails", { error: emailError.message });
      // Continue execution even if email sending fails
    }

    // Only send success response if booking log was created successfully
    res.status(statusCode.accepted).json(createDaypass);

  } catch (error) {
    logger.error("Error during payment creation or subsequent process", {
      error: error.message,
      stack: error.stack,
      paymentId: createDaypass?._id || 'N/A' // Log payment ID if available
    });

    // Log failed booking process if not already logged as payment success/booking failure
    if (error.message !== "Payment successful but booking failed") {
         try {
              await BookingLogger.logBookingAttempt({
                bookingId: req.body.ref || 'N/A', // Use ref or N/A
                userId: req.body.guestDetails ? JSON.parse(req.body.guestDetails).email : "Unknown",
                status: "failed",
                paymentStatus: createDaypass?.status || "failed",
                paymentGateway: "Paystack",
                paymentId: createDaypass?.paymentId || 'N/A',
                amount: createDaypass?.amount || req.body.amount || 0,
                currency: createDaypass?.currency || req.body.currency || 'N/A',
                errorDetails: {
                  errorMessage: error.message,
                  stackTrace: error.stack,
                  failedStep: "Payment Processing"
                },
                requestPayload: req.body,
                ipAddress: req.ip || 'Unknown',
                userAgent: req.get('User-Agent') || 'Unknown'
              });
              logger.info("Logged general failed booking process", { bookingId: req.body.ref || 'N/A' });
            } catch (logError) {
              logger.error("Failed to create general failed booking log", { originalError: error.message, loggingError: logError.message });
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
    throw new ErrorResponse("No Payment Found", 404);
  }
});

const getSingle = asyncErrorHandler(async (req, res) => {
  let daypass = await paymentModel.findById(req.params.id);
  if (daypass) {
    res.status(statusCode.accepted).json(daypass);
  } else {
    throw new ErrorResponse("No Payment Found", 404);
  }
});
const deletePaymentAll = asyncErrorHandler(async (req, res) => {
  await paymentModel.deleteMany({});
  res.status(statusCode.accepted).json({ message: "All Payments Deleted" });
});

const deletByBookingId = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  let daypass = await paymentModel.findOneAndDelete({ ref: id });
  if (daypass) {
    res.status(statusCode.accepted).json({ message: "Payment Deleted" });
  } else {
    throw new ErrorResponse("No Payment Found", 404);
  }
});

const getByBookingId = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  
  console.log("🔍 PAYMENT: getByBookingId called with id:", id);
  console.log("🔍 PAYMENT: id type:", typeof id);
  
  let daypass = await paymentModel.find({ ref: id });
  
  console.log("🔍 PAYMENT: Database query result:", daypass ? `${daypass.length} records found` : "No records found");
  if (daypass && daypass.length > 0) {
    console.log("✅ PAYMENT: Found payment records:", daypass.map(p => ({ id: p._id, ref: p.ref, status: p.status, method: p.method })));
  } else {
    console.log("❌ PAYMENT: No payment found with ref:", id);
    // Let's also check if there are any payments with similar patterns
    const allPayments = await paymentModel.find({}).limit(5);
    console.log("🔍 PAYMENT: Sample of existing refs:", allPayments.map(p => p.ref));
  }
  
  if (daypass) {
    console.log("✅ PAYMENT: Returning payment data for id:", id);
    res.status(statusCode.accepted).json(daypass);
  } else {
    console.log("❌ PAYMENT: Throwing 404 error for id:", id);
    throw new ErrorResponse("No Payment Found", 404);
  }
});

const confirm = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const { bank } = req.body;
  let payment = await paymentModel.findOne({ ref });
  if (payment) {
    payment.status = "Success"; // Update the status to confirm
    payment.method = `Bank Transfer ${bank}`;
    await payment.save();


    if (payment) {
      let amount = payment.amount
      const guestDetails = JSON.parse(payment.guestDetails);
      let email = guestDetails.email;
      let loyaltyRecord = await loyaltyCoinModel.findOne({ email });
      if (loyaltyRecord) {
        loyaltyRecord.totalSpent += Number(amount);
        loyaltyRecord.points = Math.floor(loyaltyRecord.totalSpent / 10000);
        loyaltyRecord.redeemable = loyaltyRecord.points >= 50;
        await loyaltyRecord.save();
        logger.info("Loyalty points updated", { email, totalSpent: loyaltyRecord.totalSpent, points: loyaltyRecord.points });
      } else {
        const points = Math.floor(amount / 10000);
        const newLoyalty = new loyaltyCoinModel({
          email,
          totalSpent: amount,
          points: points,
          redeemable: points >= 50
        });
        await newLoyalty.save();
        logger.info("Loyalty record created", { email, totalSpent: amount, points: newLoyalty.points });
      }
    }


    res.status(statusCode.accepted).json(payment);
    const guestDetails = JSON.parse(payment.guestDetails);
    const roomDetails = JSON.parse(payment.roomDetails);
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
        roomDetails?.selectedRooms?.map((room) => ` ${room.title}`) ||
        "Day Pass",
      checkIn: roomDetails?.visitDate
        ? `${formatDate(roomDetails?.visitDate)}, (2pm)`
        : `${roomDetails?.startDate}, (12noon)`,
      checkOut: roomDetails?.endDate
        ? `${formatDate(roomDetails?.endDate)}, (11am)`
        : `${roomDetails?.startDate}, (6pm)`,
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
        : "Day Pass",
      extras:
        roomDetails?.visitDate && roomDetails?.finalData
          ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
          : roomDetails?.startDate && roomDetails?.extras
            ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
            : "No Extras",
      subTotal: formatPrice(payment.subTotal),
      multiNightDiscount: payment.discount.toLocaleString(),
      clubMemberDiscount: payment.voucher,
      multiNightDiscountAvailable: payment.multiNightDiscount
        ? payment.multiNightDiscount
        : 0,
      vat: formatPrice(payment.vat),
      totalCost: formatPrice(payment.totalCost),
      roomsPrice: payment.roomsPrice
        ? payment.roomsPrice == "Daypass"
          ? payment.roomsPrice
          : formatPrice(payment.roomsPrice)
        : "",
      extrasPrice: payment.extrasPrice ? formatPrice(payment.extrasPrice) : "",
      roomsDiscount: payment.roomsDiscount
        ? payment.roomsDiscount == "Daypass"
          ? payment.roomsDiscount
          : formatPrice(payment.roomsDiscount)
        : "",
      discountApplied: payment.discountApplied
        ? payment.discountApplied == "true"
          ? "Yes"
          : "No"
        : "",
      voucherApplied: payment.voucherApplied
        ? payment.voucherApplied == "true"
          ? "Yes"
          : "No"
        : "",
      priceAfterVoucher: payment.priceAfterVoucher
        ? formatPrice(payment.priceAfterVoucher)
        : "",
      priceAfterDiscount: payment.priceAfterDiscount
        ? formatPrice(payment.priceAfterDiscount)
        : "",
      totalGuests: totalGuests,
    };
    sendEmail(
      guestDetails.email,
      "Your Booking Is Confirmed",
      "confirmation",
      emailContext
    );
    sendEmail(
      "bookings@jarabeachresort.com",
      "New Booking Confirmed",
      "confirmation",
      emailContext
    );
  } else {
    throw new ErrorResponse("Payment Not Found", 404);
  }
});

const cancel = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const payment = await paymentModel.findOne({ ref });
  if (payment) {
    const roomDetails = JSON.parse(payment.roomDetails);
    if (roomDetails.selectedRooms) {
      for (const room of roomDetails.selectedRooms) {
        await SubRooms.findByIdAndUpdate(room.id, {
          // $inc: { totalRoom: room.quantity },
          totalRoom: 1,
        });
      }
    }
    payment.status = "Cancelled";
    await payment.save();
    res.status(statusCode.accepted).json(payment);
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
        roomDetails?.selectedRooms?.map((room) => ` ${room.title}`) ||
        "Day Pass",
      checkIn: roomDetails?.visitDate
        ? `${formatDate(roomDetails?.visitDate)}, (2pm)`
        : `${roomDetails?.startDate}, (12noon)`,
      checkOut: roomDetails?.endDate
        ? `${formatDate(roomDetails?.endDate)}, (11am)`
        : `${roomDetails?.startDate}, (6pm)`,
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
        : "Day Pass",
      extras:
        roomDetails?.visitDate && roomDetails?.finalData
          ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
          : roomDetails?.startDate && roomDetails?.extras
            ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
            : "No Extras",
      subTotal: formatPrice(payment.subTotal),
      multiNightDiscount: payment.discount.toLocaleString(),
      clubMemberDiscount: payment.voucher,
      multiNightDiscountAvailable: payment.multiNightDiscount
        ? payment.multiNightDiscount
        : 0,
      vat: formatPrice(payment.vat),
      totalCost: formatPrice(payment.totalCost),
      roomsPrice: payment.roomsPrice
        ? payment.roomsPrice == "Daypass"
          ? payment.roomsPrice
          : formatPrice(payment.roomsPrice)
        : "",
      extrasPrice: payment.extrasPrice ? formatPrice(payment.extrasPrice) : "",
      roomsDiscount: payment.roomsDiscount
        ? payment.roomsDiscount == "Daypass"
          ? payment.roomsDiscount
          : formatPrice(payment.roomsDiscount)
        : "",
      discountApplied: payment.discountApplied
        ? payment.discountApplied == "true"
          ? "Yes"
          : "No"
        : "",
      voucherApplied: payment.voucherApplied
        ? payment.voucherApplied == "true"
          ? "Yes"
          : "No"
        : "",
      priceAfterVoucher: payment.priceAfterVoucher
        ? formatPrice(payment.priceAfterVoucher)
        : "",
      priceAfterDiscount: payment.priceAfterDiscount
        ? formatPrice(payment.priceAfterDiscount)
        : "",
      totalGuests: totalGuests,
    };
    sendEmail(
      guestDetails.email,
      "Your Booking Has Been Cancelled",
      "cancellation",
      emailContext
    );
    sendEmail(
      "bookings@jarabeachresort.com",
      "Booking Cancelled",
      "cancellation",
      emailContext
    );
  } else {
    throw new ErrorResponse("Booking Not Found", 404);
  }
});
const updatePayment = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const payment = await paymentModel.findOne({ ref });
  if (!payment) {
    throw new ErrorResponse("Payment not found", 404);
  }

  Object.assign(payment, req.body);

  await payment.save();
  res.status(200).json(payment);

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
      roomDetails?.selectedRooms?.map((room) => ` ${room.title}`) || "Day Pass",
    checkIn: roomDetails?.visitDate
      ? `${formatDate(roomDetails?.visitDate)}, (2pm)`
      : `${roomDetails?.startDate}, (12noon)`,
    checkOut: roomDetails?.endDate
      ? `${formatDate(roomDetails?.endDate)}, (11am)`
      : `${roomDetails?.startDate}, (6pm)`,
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
      : "Day Pass",
    extras:
      roomDetails?.visitDate && roomDetails?.finalData
        ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
        : roomDetails?.startDate && roomDetails?.extras
          ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
          : "No Extras",
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
      payment.previousPaymentStatus == "Pending"
        ? formatPrice(payment.totalCost)
        : parseFloat(payment.totalCost) - parseFloat(payment.previousCost) > 0
          ? (
            parseFloat(payment.totalCost) - parseFloat(payment.previousCost)
          ).toLocaleString()
          : 0,
    roomsPrice: payment.roomsPrice
      ? payment.roomsPrice == "Daypass"
        ? payment.roomsPrice
        : formatPrice(payment.roomsPrice)
      : "",
    extrasPrice: payment.extrasPrice ? formatPrice(payment.extrasPrice) : "",
    roomsDiscount: payment.roomsDiscount
      ? payment.roomsDiscount == "Daypass"
        ? payment.roomsDiscount
        : formatPrice(payment.roomsDiscount)
      : "",
    discountApplied: payment.discountApplied
      ? payment.discountApplied == "true"
        ? "Yes"
        : "No"
      : "",
    voucherApplied: payment.voucherApplied
      ? payment.voucherApplied == "true"
        ? "Yes"
        : "No"
      : "",
    priceAfterVoucher: payment.priceAfterVoucher
      ? formatPrice(payment.priceAfterVoucher)
      : "",
    priceAfterDiscount: payment.priceAfterDiscount
      ? formatPrice(payment.priceAfterDiscount)
      : "",
    totalGuests: totalGuests,
  };
  if (req.body.status === "Pending") {
    sendEmail(
      guestDetails.email,
      "Your Booking Is Updated",
      "manage_pending",
      emailContext
    );
    sendEmail(
      "bookings@jarabeachresort.com",
      "Booking Updated",
      "manage_pending",
      emailContext
    );
  } else if (req.body.status === "Success") {
    sendEmail(
      guestDetails.email,
      "Your Booking Is Updated",
      "manage_success",
      emailContext
    );
    sendEmail(
      "bookings@jarabeachresort.com",
      "Booking Updated",
      "manage_success",
      emailContext
    );
  }
});
module.exports = {
  create,
  getAll,
  getByBookingId,
  getSingle,
  confirm,
  cancel,
  updatePayment,
  deletePaymentAll,
  deletByBookingId,
};
