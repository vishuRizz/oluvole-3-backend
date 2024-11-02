const { daypassBooking } = require("../models/overnight.booking.schema");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");
// const shortid = require("shortid");
// const { nanoid } = require("nanoid");

const createBooking = asyncErrorHandler(async (req, res) => {
  let { guestCount, guestDetails, roomDetails } = req.body;
  guestDetails = JSON.parse(guestDetails);
  roomDetails = JSON.parse(roomDetails);
  const file = req.file;
  const fileUrl = file
    ? `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
    : null;
  const updatedGuestDetails = {
    ...guestDetails,
    photo: fileUrl,
  };

  // Generate a short ID
  // const shortId = shortid.generate(); // Generate a short unique ID
  const { nanoid } = await import("nanoid");

  let create = await daypassBooking.create({
    totalGuest: guestCount,
    bookingDetails: roomDetails,
    guestDetails: updatedGuestDetails,
    shortId: nanoid(8).toUpperCase(), // Store the short ID
  });

  res.status(200).json(create); // Send the booking with the short ID
});

const getAllBooking = asyncErrorHandler(async (req, res) => {
  let allBooking = await daypassBooking.find({}).sort({ createdAt: -1 });
  res.status(200).json(allBooking);
});

const getBookingByRef = asyncErrorHandler(async (req, res) => {
  const { ref } = req.params;

  // Attempt to find the booking by either _id or shortId
  const booking = await daypassBooking.findOne({ shortId: ref }); // Allow fetching by either _id or shortId

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
