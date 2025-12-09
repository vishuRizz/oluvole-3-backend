const BlockedRoom = require("../models/blockedRoom.schema");
const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const { sendEmail } = require("../config/mail.config");
const logger = require("../utils/logger");

const getAllBlockedRooms = asyncErrorHandler(async (req, res) => {
  const seasonalDates = await BlockedRoom.find({});
  if (seasonalDates.length > 0) {
    res.status(200).json(seasonalDates);
  } else {
    throw new ErrorResponse("No Blocked Room found", 404);
  }
});

const createBlockedRoom = asyncErrorHandler(async (req, res) => {
  const {
    roomId, roomTitle, date, description, staffName, additionalInfo,
    arrivalDate, departureDate, group, rooms, guestName, notes,
    guestEmail, guestPaymentAmount, guestPaymentMethod
  } = req.body;

  const newBlockedRoomData = {
    roomId,
    roomTitle,
    date,
    description,
    staffName,
    additionalInfo,
    arrivalDate: arrivalDate || null,
    departureDate: departureDate || null,
    group: group || '',
    rooms: rooms || 0,
    guestName: guestName || '',
    notes: notes || '',
    guestEmail: guestEmail || '',
    guestPaymentAmount: guestPaymentAmount || '',
    guestPaymentMethod: guestPaymentMethod || ''
  };

  if(description === 'Guest Booking (Manual)'){
    try {
      const emailContext = {
        name: guestName,
        email: guestEmail,
        id: roomId,
        bookingType: roomTitle,
        checkIn: arrivalDate ? `${new Date(arrivalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, (2pm)` : '',
        checkOut: departureDate ? `${new Date(departureDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, (11am)` : '',
        numberOfGuests: group || 'Not specified',
        numberOfNights: arrivalDate && departureDate ? Math.floor((new Date(departureDate) - new Date(arrivalDate)) / (1000 * 60 * 60 * 24)) : 'Not specified',
        extras: 'No Extras',
        subTotal: guestPaymentAmount ? Number(guestPaymentAmount).toLocaleString() : '0',
        multiNightDiscount: '0',
        clubMemberDiscount: '0',
        multiNightDiscountAvailable: 0,
        vat: guestPaymentAmount ? (Number(guestPaymentAmount) * 0.125).toLocaleString() : '0',
        totalCost: guestPaymentAmount ? Number(guestPaymentAmount).toLocaleString() : '0',
        roomsPrice: guestPaymentAmount ? Number(guestPaymentAmount).toLocaleString() : '0',
        extrasPrice: '0',
        roomsDiscount: '0',
        discountApplied: 'No',
        voucherApplied: 'No',
        priceAfterVoucher: guestPaymentAmount ? Number(guestPaymentAmount).toLocaleString() : '0',
        priceAfterDiscount: guestPaymentAmount ? Number(guestPaymentAmount).toLocaleString() : '0',
        totalGuests: group || 'Not specified'
      };

      await sendEmail(
        guestEmail,
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
      logger.info("Confirmation emails sent for manual booking", { guestEmail, roomId });
    } catch (emailError) {
      logger.error("Failed to send confirmation emails for manual booking", {
        error: emailError.message,
        guestEmail,
        roomId
      });
    }
  }

  const newSeasonalDate = new BlockedRoom(newBlockedRoomData);
  await newSeasonalDate.save();
  if (newSeasonalDate) {
    res.status(201).json(newSeasonalDate);
  } else {
    throw new ErrorResponse("Can't create blocked room", 404);
  }
});

const updateBlockedRoom = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { roomId, roomTitle, date, description } = req.body;
  const seasonalDate = await BlockedRoom.findByIdAndUpdate(id, {
    roomId,
    roomTitle,
    date,
    description,
  });
  if (seasonalDate) {
    res.status(200).json(seasonalDate);
  } else {
    throw new ErrorResponse("Blocked Room not found", 404);
  }
});

const deleteBlockedRoom = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const seasonalDate = await BlockedRoom.findByIdAndDelete(id);

  if (seasonalDate) {
    res.status(200).json({ message: "Blocked Room deleted" });
  } else {
    throw new ErrorResponse("Blocked Room not found", 404);
  }
});

module.exports = {
  getAllBlockedRooms,
  createBlockedRoom,
  updateBlockedRoom,
  deleteBlockedRoom,
};
