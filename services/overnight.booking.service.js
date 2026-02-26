const { overnightBooking } = require('../models/overnight.booking.schema');
const logger = require('../utils/logger');
const { normalizeRoomDetails } = require('../utils/nightlyAssignments');
const { paginate } = require('../utils/paginate');
const {
  ErrorResponse,
  asyncErrorHandler,
} = require('../middlewares/error/error');
const {
  checkRoomAvailability,
  checkMultiNightAvailability,
} = require('../utils/availabilityChecker');
const Guest = require('../models/guest.schema');
const { processGuestVisit } = require('../utils/guestManager');
// const shortid = require("shortid");
// const { nanoid } = require("nanoid");
const createBooking = asyncErrorHandler(async (req, res) => {
  try {
    let { guestCount, guestDetails, roomDetails, ref } = req.body;
    guestDetails = JSON.parse(guestDetails);
    roomDetails = JSON.parse(roomDetails);
    guestCount = JSON.parse(guestCount);
    roomDetails = normalizeRoomDetails(roomDetails);
    const file = req.file;
    const fileData = file ? file.filename : 'no file';
    if (!guestCount || !guestDetails || !roomDetails) {
      logger.error('Invalid Booking Data', { body: req.body, file: fileData });
      throw new ErrorResponse('Invalid request', 400);
    }
    logger.info('Booking initiated', { email: guestDetails.email });
    let fileUrl = file
      ? `uploads/${file.filename}`
      : (typeof guestDetails.photo === 'string' && guestDetails.photo) ||
        (typeof guestDetails.file === 'string' && guestDetails.file !== 'ID ON FILE' ? guestDetails.file : null);
    if (!fileUrl && guestDetails.email) {
      const existingGuest = await Guest.findOne({ email: guestDetails.email }).select('photo');
      fileUrl = existingGuest?.photo || null;
    }
    const updatedGuestDetails = {
      ...guestDetails,
      photo: fileUrl,
    };

    let availabilityCheck;

    if (roomDetails.multiNightSelections) {
      availabilityCheck = await checkMultiNightAvailability(
        roomDetails.multiNightSelections
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
        roomDetails.endDate
      );
    }

    if (availabilityCheck && !availabilityCheck.available) {
      logger.error('Booking blocked due to unavailability', {
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

    // Multi-night booking transformation
    if (roomDetails.multiNightSelections) {
      const roomAssignments = [];

      Object.entries(roomDetails.multiNightSelections).forEach(
        ([date, selections]) => {
          selections.forEach((selection) => {
            roomAssignments.push({
              roomId: selection.roomId,
              date: new Date(date),
              roomDetails: {
                title: selection.room?.title,
                groupRef: selection.room?.groupRef,
                price: selection.room?.price,
                capacity: selection.room?.capacity,
                guests: selection.guests,
              },
            });
          });
        }
      );

      roomDetails.roomAssignments = roomAssignments;

      logger.info('Multi-night booking processed', {
        totalNights: Object.keys(roomDetails.multiNightSelections).length,
        totalRoomAssignments: roomAssignments.length,
      });
    }

    // Generate or use provided shortId
    let shortIdToUse = ref;
    if (!shortIdToUse) {
      const { nanoid } = await import('nanoid');
      shortIdToUse = nanoid(8).toUpperCase();
    }

    let create = await overnightBooking.create({
      totalGuest: guestCount,
      bookingDetails: roomDetails,
      guestDetails: updatedGuestDetails,
      shortId: shortIdToUse,
      status: req.body.status || 'Pending',
    });

    // Keep guest profile synced from booking data; don't increment visit count here.
    try {
      await processGuestVisit(
        {
          ...updatedGuestDetails,
          email: updatedGuestDetails.email,
          name: `${updatedGuestDetails.firstname || ''} ${updatedGuestDetails.lastname || ''}`.trim(),
        },
        true,
        { incrementVisit: false }
      );
    } catch (guestErr) {
      logger.error('Failed to sync guest profile on overnight booking create', {
        error: guestErr.message,
        email: updatedGuestDetails?.email,
      });
    }

    res.status(200).json(create);
  } catch (error) {
    logger.error('Error creating booking', {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
    res.status(500).json(error);
  }
  // Send the booking with the short ID
});

const getAllBooking = asyncErrorHandler(async (req, res) => {
  let allBooking = await overnightBooking.find({}).sort({ createdAt: -1 });
  res.status(200).json(allBooking);
});

const getPaginatedBookings = asyncErrorHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paginate(overnightBooking, {}, { page, limit });
  res.status(200).json(result);
});

const getBookingByRef = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  // Attempt to find the booking by either _id or shortId
  const booking = await overnightBooking.findOne({ shortId: ref });
  if (!booking) {
    throw new ErrorResponse('Booking not found', 404);
  }
  res.status(200).json(booking);
});

const deletAllBooking = asyncErrorHandler(async (req, res) => {
  await overnightBooking.deleteMany({});
  res.status(200).json({ message: 'All booking deleted' });
});

const deleteBookingByRef = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const booking = await overnightBooking.findOneAndDelete({ shortId: ref });
  if (!booking) {
    throw new ErrorResponse('Booking not found', 404);
  }
  res.status(200).json({ message: 'Booking deleted' });
});

const updateBooking = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  let { guestCount, guestDetails, roomDetails } = req.body;
  guestDetails = JSON.parse(guestDetails);
  roomDetails = JSON.parse(roomDetails);
  guestCount = JSON.parse(guestCount);
  roomDetails = normalizeRoomDetails(roomDetails);
  const file = req.file;
  let fileUrl = file
    ? `uploads/${file.filename}`
    : (typeof guestDetails.photo === 'string' && guestDetails.photo) ||
      (typeof guestDetails.file === 'string' && guestDetails.file !== 'ID ON FILE' ? guestDetails.file : null);
  if (!fileUrl && guestDetails.email) {
    const existingGuest = await Guest.findOne({ email: guestDetails.email }).select('photo');
    fileUrl = existingGuest?.photo || null;
  }
  const updatedGuestDetails = {
    ...guestDetails,
    photo: fileUrl,
  };

  if (roomDetails.multiNightSelections) {
    const roomAssignments = [];

    Object.entries(roomDetails.multiNightSelections).forEach(
      ([date, selections]) => {
        selections.forEach((selection) => {
          roomAssignments.push({
            roomId: selection.roomId,
            date: new Date(date),
            roomDetails: {
              title: selection.room?.title,
              groupRef: selection.room?.groupRef,
              price: selection.room?.price,
              capacity: selection.room?.capacity,
              guests: selection.guests,
            },
          });
        });
      }
    );

    roomDetails.roomAssignments = roomAssignments;

    logger.info('Multi-night booking update processed', {
      totalNights: Object.keys(roomDetails.multiNightSelections).length,
      totalRoomAssignments: roomAssignments.length,
    });
  }

  let booking = await overnightBooking.findOne(
    { shortId: ref } // Allow fetching by either _id or shortId
  );
  if (!booking) {
    throw new ErrorResponse('Booking not found', 404);
  }

  booking.totalGuest = guestCount;
  booking.bookingDetails = roomDetails;
  booking.guestDetails = updatedGuestDetails;
  if (req.body.status) {
    booking.status = req.body.status;
  }

  await booking.save();

  try {
    await processGuestVisit(
      {
        ...updatedGuestDetails,
        email: updatedGuestDetails.email,
        name: `${updatedGuestDetails.firstname || ''} ${updatedGuestDetails.lastname || ''}`.trim(),
      },
      true,
      { incrementVisit: false }
    );
  } catch (guestErr) {
    logger.error('Failed to sync guest profile on overnight booking update', {
      error: guestErr.message,
      email: updatedGuestDetails?.email,
    });
  }

  res.status(200).json(booking);
});

const updateBookingStatus = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  const { status } = req.body;

  const validStatuses = ["Pending", "Confirmed", "Checked In", "Checked Out", "Cancelled"];
  if (!validStatuses.includes(status)) {
    throw new ErrorResponse(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
  }

  const booking = await overnightBooking.findOne({ shortId: ref });
  if (!booking) {
    throw new ErrorResponse("Booking not found", 404);
  }

  const previousStatus = booking.status;
  booking.status = status;
  await booking.save();

  // Trigger instant feedback email when guest is checked out
  if (status === "Checked Out" && previousStatus !== "Checked Out") {
    const { sendEmail } = require("../config/mail.config");
    const guestDetails = booking.guestDetails;
    const surveyLink = `${process.env.CLIENT_BASEURL}/survey/${booking.shortId}`;

    sendEmail(
      guestDetails.email,
      "Thanks for choosing Jara Beach Resort 🌴 - Share Your Feedback",
      "survey_email",
      {
        name: guestDetails.firstname + " " + guestDetails.lastname,
        surveyLink: surveyLink,
      }
    );
    logger.info("Checkout feedback email sent", { email: guestDetails.email, bookingId: booking.shortId });
  }

  // Send cancellation email when booking status is changed to Cancelled
  if (status === "Cancelled" && previousStatus !== "Cancelled") {
    try {
      const { sendEmail } = require("../config/mail.config");
      const { paymentModel } = require('../models');

      const payment = await paymentModel.findOne({ ref });
      if (payment && payment.guestDetails) {
        const guestDetails = typeof payment.guestDetails === 'string'
          ? JSON.parse(payment.guestDetails)
          : payment.guestDetails;
        const roomDetails = typeof payment.roomDetails === 'string'
          ? JSON.parse(payment.roomDetails)
          : payment.roomDetails;
        const bookingInfo = payment.bookingInfo
          ? (typeof payment.bookingInfo === 'string' ? JSON.parse(payment.bookingInfo) : payment.bookingInfo)
          : null;

        const formatDateEmail = (dateString) => {
          const date = new Date(dateString);
          const day = date.getDate();
          const v = day % 100;
          const suffix = (v - 20) % 10 === 1 ? 'st' : (v - 20) % 10 === 2 ? 'nd' : (v - 20) % 10 === 3 ? 'rd' : v === 1 ? 'st' : v === 2 ? 'nd' : v === 3 ? 'rd' : 'th';
          const month = date.toLocaleString('en-US', { month: 'long' });
          const year = date.getFullYear();
          return `${day}${suffix}, ${month.toLowerCase()} ${year}`;
        };
        const formatPrice = (price) => Number(price).toLocaleString();
        const isValidNumber = (val) => !isNaN(parseFloat(val)) && isFinite(val);

        const countingGuests = (guestCount) => {
          const numChildren = guestCount?.ages?.filter((age) => age.includes('child')).length || 0;
          const numToddlers = guestCount?.ages?.filter((age) => age.includes('toddler')).length || 0;
          const numInfants = guestCount?.ages?.filter((age) => age.includes('infant')).length || 0;
          return { adults: guestCount?.adults || 0, children: numChildren, toddlers: numToddlers, infants: numInfants };
        };

        const totalGuests = roomDetails?.visitDate
          ? (roomDetails?.selectedRooms?.[0]?.guestCount?.adults || 0) +
          countingGuests(roomDetails?.selectedRooms?.[0]?.guestCount).children +
          countingGuests(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
          countingGuests(roomDetails?.selectedRooms?.[0]?.guestCount).infants
          : (bookingInfo?.adultsAlcoholic || 0) + (bookingInfo?.adultsNonAlcoholic || 0) +
          (bookingInfo?.Nanny || 0) + (bookingInfo?.childTotal || 0);

        const emailContext = {
          name: payment.name || 'N/A',
          email: guestDetails.email || 'N/A',
          id: payment.ref || ref,
          bookingType: roomDetails?.selectedRooms?.map((room) => ` ${room.title}`).join(',') || 'Day Pass',
          checkIn: roomDetails?.visitDate
            ? `${formatDateEmail(roomDetails.visitDate)}, (2pm)`
            : roomDetails?.startDate
              ? `${formatDateEmail(roomDetails.startDate)}, (12noon)`
              : 'N/A',
          checkOut: roomDetails?.endDate
            ? `${formatDateEmail(roomDetails.endDate)}, (11am)`
            : roomDetails?.startDate
              ? `${formatDateEmail(roomDetails.startDate)}, (6pm)`
              : 'N/A',
          numberOfGuests: roomDetails?.visitDate && roomDetails?.selectedRooms?.[0]?.guestCount
            ? `${roomDetails.selectedRooms[0].guestCount.adults ?? 0} Adults, ${countingGuests(roomDetails.selectedRooms[0].guestCount).children} Children, ${countingGuests(roomDetails.selectedRooms[0].guestCount).toddlers} Toddlers, ${countingGuests(roomDetails.selectedRooms[0].guestCount).infants} Infants`
            : bookingInfo
              ? `${bookingInfo.adultsAlcoholic ?? 0} Adults Alcoholic, ${bookingInfo.adultsNonAlcoholic ?? 0} Adults Non Alcoholic, ${bookingInfo.Nanny ?? 0} Nanny, ${bookingInfo.childTotal ?? 0} Child`
              : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0} Children`,
          numberOfNights: roomDetails?.visitDate
            ? Math.floor((new Date(roomDetails.endDate) - new Date(roomDetails.visitDate)) / (1000 * 60 * 60 * 24))
            : 'Day Pass',
          extras: roomDetails?.visitDate && roomDetails?.finalData?.length > 0
            ? roomDetails.finalData.map((e) => ` ${e.title}`).join(', ')
            : roomDetails?.startDate && roomDetails?.extras?.length > 0
              ? roomDetails.extras.map((e) => ` ${e.title}`).join(', ')
              : 'No Extras',
          subTotal: isValidNumber(payment.subTotal) ? formatPrice(payment.subTotal) : 'N/A',
          multiNightDiscount: isValidNumber(payment.discount) ? formatPrice(payment.discount) : 'N/A',
          clubMemberDiscount: isValidNumber(payment.voucher) ? formatPrice(payment.voucher) : 'N/A',
          vat: isValidNumber(payment.vat) ? formatPrice(payment.vat) : 'N/A',
          totalCost: isValidNumber(payment.totalCost) ? formatPrice(payment.totalCost) : 'N/A',
          roomsPrice: payment.roomsPrice ? (payment.roomsPrice === 'Daypass' ? payment.roomsPrice : formatPrice(payment.roomsPrice)) : 'N/A',
          extrasPrice: isValidNumber(payment.extrasPrice) ? formatPrice(payment.extrasPrice) : 'N/A',
          roomsDiscount: isValidNumber(payment.roomsDiscount) ? formatPrice(payment.roomsDiscount) : 'N/A',
          discountApplied: payment.discountApplied ? (payment.discountApplied === 'true' ? 'Yes' : 'No') : 'N/A',
          voucherApplied: payment.voucherApplied ? (payment.voucherApplied === 'true' ? 'Yes' : 'No') : 'N/A',
          priceAfterVoucher: isValidNumber(payment.priceAfterVoucher) ? formatPrice(payment.priceAfterVoucher) : 'N/A',
          priceAfterDiscount: isValidNumber(payment.priceAfterDiscount) ? formatPrice(payment.priceAfterDiscount) : 'N/A',
          totalGuests: isValidNumber(totalGuests) ? totalGuests : 'N/A',
        };

        if (guestDetails.email) {
          sendEmail(guestDetails.email, 'Your Booking Has Been Cancelled', 'cancellation', emailContext);
          sendEmail('bookings@jarabeachresort.com', 'Booking Cancelled', 'cancellation', emailContext);
          logger.info("Cancellation email sent", { email: guestDetails.email, bookingId: ref });
        }
      }
    } catch (emailErr) {
      logger.error("Failed to send cancellation email from status update", { error: emailErr.message, bookingId: ref });
    }
  }

  res.status(200).json({ message: `Booking status updated to ${status}`, booking });
});

module.exports = {
  createBooking,
  getAllBooking,
  getPaginatedBookings,
  getBookingByRef,
  updateBooking,
  updateBookingStatus,
  deletAllBooking,
  deleteBookingByRef,
};
