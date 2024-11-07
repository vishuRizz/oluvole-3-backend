const { asyncErrorHandler } = require("../middlewares/error/error");
const { overnightBooking } = require("../models/overnight.booking.schema");
const { RoomTypes, SubRooms } = require("../models/rooms.schema");
const { paymentModel } = require("../models");

const createRoom = asyncErrorHandler(async (req, res) => {
  let create = await RoomTypes.create(req.body);
  res.status(200).json(create);
});

const getRoom = asyncErrorHandler(async (req, res) => {
  let getAll = await RoomTypes.find({});
  res.status(200).json(getAll);
});

const updateRoom = asyncErrorHandler(async (req, res) => {
  let update = await RoomTypes.findByIdAndUpdate(req.params.id, req.body);
  res.status(200).json(update);
});

const createSubRoom = asyncErrorHandler(async (req, res) => {
  let create = await SubRooms.create(req.body);
  res.status(200).json(create);
});

const getSubRoom = asyncErrorHandler(async (req, res) => {
  let getAll = await SubRooms.find({ roomId: req.params.id });
  res.status(200).json(getAll);
});

const updateSubRoom = asyncErrorHandler(async (req, res) => {
  let update = await SubRooms.findByIdAndUpdate(req.params.id, req.body);
  res.status(200).json(update);
});

const deleteSubRoom = asyncErrorHandler(async (req, res) => {
  let del = await SubRooms.findByIdAndDelete(req.params.id);
  res.status(200).json({ msg: "SUB ROOM DELETED" });
});

const getAllSubRoom = asyncErrorHandler(async (req, res) => {
  let allRooms = await SubRooms.find({}).populate("roomId");
  res.status(200).json(allRooms);
});

const getAllSubRoom2 = asyncErrorHandler(async (req, res) => {
  console.log("request body", req.body);
  let { visitDate, endDate } = req.body;
  if (!visitDate || !endDate) {
    return res
      .status(400)
      .json({ error: "visitDate and endDate are required" });
  }

  // Fetch all bookings
  const bookings = await overnightBooking.find({});
  let allRooms = await SubRooms.find({}).populate("roomId");
  let startingDate = new Date(visitDate);
  let endingDate = new Date(endDate);

  for (const bookingItem of bookings) {
    if (!bookingItem.bookingDetails) {
      console.log(
        "booking details not found for booking with id ",
        bookingItem._id
      );
      continue; // Skip to the next booking
    }

    const visitDate2 = new Date(bookingItem.bookingDetails.visitDate);
    const endDate2 = new Date(bookingItem.bookingDetails.endDate);

    // Check if the booking dates overlap with the requested dates
    if (visitDate2 <= endingDate && endDate2 > startingDate) {
      // Fetch the corresponding payment for the booking
      const payment = await paymentModel.findOne({ ref: bookingItem.shortId });

      // Only decrement available rooms if the payment status is confirmed or pending
      if (
        payment &&
        (payment.status === "Success" || payment.status === "Pending")
      ) {
        bookingItem.bookingDetails.selectedRooms.forEach((selectedRoom) => {
          let quantity = selectedRoom.quantity;
          const roomIndex = allRooms.findIndex((room) => {
            return room?._id?.toString() === selectedRoom?.id?.toString();
          });
          console.log(roomIndex);
          if (roomIndex !== -1) {
            allRooms[roomIndex].totalRoom -= quantity; // Decrement totalRoom
          }
        });
      }
    }
  }

  const availableRooms = allRooms.filter((room) => room.totalRoom > 0);
  res.status(200).json(availableRooms);
});
const getBookingsForRoom = asyncErrorHandler(async (req, res) => {
  const { roomId } = req.params;
  const bookings = await overnightBooking.find({
    "bookingDetails.selectedRooms.id": roomId,
  });
  if (!bookings) {
    return res.status(404).json({ error: "Bookings not found" });
  }
  res.status(200).json(bookings);
});

module.exports = {
  createRoom,
  getRoom,
  updateRoom,
  createSubRoom,
  getSubRoom,
  updateSubRoom,
  deleteSubRoom,
  getAllSubRoom,
  getAllSubRoom2,
  getBookingsForRoom,
};
