const { asyncErrorHandler } = require("../middlewares/error/error");
const { overnightBooking } = require("../models/overnight.booking.schema");
const { RoomTypes, SubRooms } = require("../models/rooms.schema");
const { paymentModel } = require("../models");
const {
  getStoredNightlyAssignments,
} = require("../utils/nightlyAssignments");

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

  // Create a set to track booked room IDs
  const bookedRoomIds = new Set();

  for (const bookingItem of bookings) {
    if (!bookingItem.bookingDetails) {
      console.log(
        "booking details not found for booking with id ",
        bookingItem._id
      );
      continue; // Skip to the next booking
    }

    const nightlyAssignments = getStoredNightlyAssignments(
      bookingItem.bookingDetails
    );

    if (!nightlyAssignments.length) {
      continue;
    }

    const payment = await paymentModel.findOne({ ref: bookingItem.shortId });

    if (
      !payment ||
      (payment.status !== "Success" && payment.status !== "Pending")
    ) {
      continue;
    }

    nightlyAssignments.forEach((assignment) => {
      if (!assignment?.roomId || !assignment?.startDate || !assignment?.endDate)
        return;
      const assignmentStart = new Date(assignment.startDate);
      const assignmentEnd = new Date(assignment.endDate);

      // Check if nightly assignment overlaps with requested dates
      if (assignmentStart < endingDate && assignmentEnd > startingDate) {
        bookedRoomIds.add(`${assignment.roomId}`);
      }
    });
  }

  // Filter out booked rooms from the available rooms
  const availableRooms = allRooms.filter(
    (room) => !bookedRoomIds.has(room._id.toString())
  );

  res.status(200).json(availableRooms);
});
const getBookingsForRoom = asyncErrorHandler(async (req, res) => {
  const { roomId } = req.params;
  const bookings = await overnightBooking
    .find({
      "bookingDetails.selectedRooms.id": roomId,
    })
    .lean();

  if (!bookings || bookings.length === 0) {
    return res.status(200).json([]);
  }

  const expandedBookings = [];

  bookings.forEach((booking) => {
    const nightlyAssignments = getStoredNightlyAssignments(
      booking.bookingDetails
    ).filter((assignment) => `${assignment.roomId}` === `${roomId}`);

    if (!nightlyAssignments.length) {
      return;
    }

    nightlyAssignments.forEach((assignment, index) => {
      const cloned = { ...booking };
      cloned.parentBookingId = booking._id;
      cloned._id = `${booking._id}_${assignment.roomId}_${assignment.startDate}_${index}`;
      cloned.bookingDetails = {
        ...cloned.bookingDetails,
        visitDate: assignment.startDate,
        endDate: assignment.endDate,
        selectedRooms: [
          {
            ...(assignment.roomData || {}),
            id: assignment.roomId,
            title: assignment.roomTitle || assignment.roomData?.title,
            nightlyGuestAllocation: assignment.guestAllocation || null,
          },
        ],
      };
      cloned.nightlyAssignment = assignment;
      expandedBookings.push(cloned);
    });
  });

  expandedBookings.sort(
    (a, b) =>
      new Date(a.bookingDetails.visitDate) -
      new Date(b.bookingDetails.visitDate)
  );

  res.status(200).json(expandedBookings);
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
