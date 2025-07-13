const { daypassBooking } = require("../models/overnight.booking.schema");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");
// const shortid = require("shortid");
// const { nanoid } = require("nanoid");
const logger = require("../utils/logger");

const createBooking = asyncErrorHandler(async (req, res) => {
  try {
    console.log("coming details", req.body);
    let { guestCount, guestDetails, roomDetails, ref } = req.body;
    guestDetails = JSON.parse(guestDetails);
    roomDetails = JSON.parse(roomDetails);
    const file = req.file;
    const fileData = file ? file.filename : "no file";
    if (!guestCount || !guestDetails || !roomDetails || !file) {
      logger.error("Invalid Booking Data", { body: req.body, file: fileData });
      throw new ErrorResponse("Invalid request", 400);
    }
    logger.info("Booking initiated", { email: guestDetails.email });
    const fileUrl = file
      ? `${process.env.SERVER_BASEURL}/uploads/${file.filename}`
      : null;
    const updatedGuestDetails = {
      ...guestDetails,
      photo: fileUrl,
    };

    let shortIdToUse = ref;
    if (!shortIdToUse) {
      const { nanoid } = await import("nanoid");
      shortIdToUse = nanoid(8).toUpperCase();
    }

    let create = await daypassBooking.create({
      totalGuest: guestCount,
      bookingDetails: roomDetails,
      guestDetails: updatedGuestDetails,
      shortId: shortIdToUse,
    });

    res.status(200).json(create);
    // Send the booking with the short ID
  } catch (error) {
    logger.error("Error creating booking", {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
    res.status(500).json(error);
  }
});

const getAllBooking = asyncErrorHandler(async (req, res) => {
  let allBooking = await daypassBooking.find({}).sort({ createdAt: -1 });
  res.status(200).json(allBooking);
});

const getBookingByRef = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;
  // Attempt to find the booking by either _id or shortId
  const booking = await daypassBooking.findOne({ shortId: ref });
  if (!booking) {
    throw new ErrorResponse("Booking not found", 404);
  }
  res.status(200).json(booking);
});
const deletAllBooking = asyncErrorHandler(async (req, res) => {
  await daypassBooking.deleteMany({});
  res.status(200).json({ message: "All booking deleted" });
});

module.exports = {
  createBooking,
  getAllBooking,
  getBookingByRef,
  deletAllBooking,
};
