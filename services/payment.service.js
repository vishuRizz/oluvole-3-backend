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
  // console.log(req.body);
  try {
    logger.info("Processing payment request", { requestBody: req.body });
    const guestDetails = JSON.parse(req.body.guestDetails);
    const roomDetails = JSON.parse(req.body.roomDetails);
    const bookingInfo = req.body.bookingInfo
      ? JSON.parse(req.body.bookingInfo)
      : null;
    // const costBreakDown = JSON.parse(req.body.CostBreakDown);
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
    let createDaypass = await paymentModel.create(req.body);

    // Log booking creation
    await BookingLog.create({
      bookingId: createDaypass._id,
      userId: guestDetails.email,
      status: "success",
      paymentStatus: createDaypass.status,
      paymentGateway: "Paystack",
      paymentId: createDaypass.paymentId,
      amount: createDaypass.amount,
      currency: createDaypass.currency,
      bookingDetails: req.body,
      requestPayload: req.body,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    //GENERATE LOYALTY POINTS========
    try {
      let amount = createDaypass.amount
      const guestDetails = JSON.parse(createDaypass.guestDetails);
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
    } catch (error) {
      console.log('error while generating loyalty points:', error)
    }

    if (createDaypass) {
      logger.info("Payment successfully created", {
        payment: createDaypass._id,
      });
      res.status(statusCode.accepted).json(createDaypass);
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
        subTotal: formatPrice(req.body.subTotal),
        multiNightDiscount: req.body.discount.toLocaleString(),
        clubMemberDiscount: req.body.voucher,
        multiNightDiscountAvailable: req.body.multiNightDiscount
          ? req.body.multiNightDiscount
          : 0,
        vat: formatPrice(req.body.vat),
        totalCost: formatPrice(req.body.totalCost),
        roomsPrice:
          req.body.roomsPrice == "Daypass"
            ? req.body.roomsPrice
            : formatPrice(req.body.roomsPrice),
        extrasPrice: formatPrice(req.body.extrasPrice),
        roomsDiscount:
          req.body.roomsDiscount == "Daypass"
            ? req.body.roomsDiscount
            : formatPrice(req.body.roomsDiscount),
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
          : formatPrice(req.body.subTotal),
        priceAfterDiscount: req.body.priceAfterDiscount
          ? formatPrice(req.body.priceAfterDiscount)
          : formatPrice(req.body.subTotal),
        totalGuests: totalGuests,
      };
      if (req.body.status === "Pending") {
        sendEmail(
          guestDetails.email,
          "Your Booking Is Pending",
          "pending_payment",
          emailContext
        );
        sendEmail(
          "bookings@jarabeachresort.com",
          "New Booking Pending",
          "pending_payment",
          emailContext
        );
      } else if (req.body.status === "Success") {
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
      }
    } else {
      throw new ErrorResponse("Failed To Create Payment", 404);
    }
  } catch (error) {
    logger.error("Error during payment creation", {
      error: error.message,
      stack: error.stack,
    });
    // Log booking failure
    await BookingLog.create({
      bookingId: req.body.ref,
      userId: req.body.guestDetails ? JSON.parse(req.body.guestDetails).email : "Unknown",
      status: "failed",
      paymentStatus: "failed",
      paymentGateway: "Paystack",
      errorDetails: {
        errorMessage: error.message,
        stackTrace: error.stack,
        failedStep: "Payment Creation"
      },
      requestPayload: req.body,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    throw new ErrorResponse("Failed To Create Payment", 404);
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
  let daypass = await paymentModel.find({ ref: id });
  if (daypass) {
    res.status(statusCode.accepted).json(daypass);
  } else {
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
