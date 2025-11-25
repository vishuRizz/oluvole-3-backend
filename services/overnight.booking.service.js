const { overnightBooking } = require('../models/overnight.booking.schema');
const logger = require('../utils/logger');
const {
  normalizeRoomDetails,
} = require("../utils/nightlyAssignments");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require('../middlewares/error/error');
// const shortid = require("shortid");
// const { nanoid } = require("nanoid");
const createBooking = asyncErrorHandler(async (req, res) => {
  try {
    let { guestCount, guestDetails, roomDetails, ref } = req.body;
    guestDetails = JSON.parse(guestDetails);
    roomDetails = JSON.parse(roomDetails);
    roomDetails = normalizeRoomDetails(roomDetails);
    const file = req.file;
    const fileData = file ? file.filename : 'no file';
    if (!guestCount || !guestDetails || !roomDetails || !file) {
      logger.error('Invalid Booking Data', { body: req.body, file: fileData });
      throw new ErrorResponse('Invalid request', 400);
    }
    logger.info('Booking initiated', { email: guestDetails.email });
    const fileUrl = file
      ? `${process.env.SERVER_BASEURL}/uploads/${file.filename}`
      : null;
    const updatedGuestDetails = {
      ...guestDetails,
      photo: fileUrl,
    };

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
      const { nanoid } = await import("nanoid");
      shortIdToUse = nanoid(8).toUpperCase();
    }

    let create = await overnightBooking.create({
      totalGuest: guestCount,
      bookingDetails: roomDetails,
      guestDetails: updatedGuestDetails,
      shortId: shortIdToUse,
    });

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
  roomDetails = normalizeRoomDetails(roomDetails);
  const file = req.file;
  const fileUrl = file
    ? `${process.env.SERVER_BASEURL}/uploads/${file.filename}`
    : null;
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

  await booking.save();
  res.status(200).json(booking);
});
module.exports = {
  createBooking,
  getAllBooking,
  getBookingByRef,
  updateBooking,
  deletAllBooking,
  deleteBookingByRef,
};
