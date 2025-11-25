const { asyncErrorHandler } = require('../middlewares/error/error');
const { overnightBooking } = require('../models/overnight.booking.schema');
const { RoomTypes, SubRooms } = require('../models/rooms.schema');
const { paymentModel } = require('../models');

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
  res.status(200).json({ msg: 'SUB ROOM DELETED' });
});

const getAllSubRoom = asyncErrorHandler(async (req, res) => {
  let allRooms = await SubRooms.find({}).populate('roomId');
  res.status(200).json(allRooms);
});

const getAllSubRoom2 = asyncErrorHandler(async (req, res) => {
  console.log('request body', req.body);
  let { visitDate, endDate } = req.body;
  if (!visitDate || !endDate) {
    return res
      .status(400)
      .json({ error: 'visitDate and endDate are required' });
  }

  // Fetch all bookings
  const bookings = await overnightBooking.find({});
  let allRooms = await SubRooms.find({}).populate('roomId');
  let startingDate = new Date(visitDate);
  let endingDate = new Date(endDate);

  const roomOccupancyMap = new Map();

  for (const bookingItem of bookings) {
    if (!bookingItem.bookingDetails) {
      console.log(
        'booking details not found for booking with id ',
        bookingItem._id
      );
      continue; // Skip to the next booking
    }

    const visitDate2 = new Date(bookingItem.bookingDetails.visitDate);
    const endDate2 = new Date(bookingItem.bookingDetails.endDate);

    // Check if the booking dates overlap with the requested dates
    if (visitDate2 < endingDate && endDate2 > startingDate) {
      // Fetch the corresponding payment for the booking
      const payment = await paymentModel.findOne({ ref: bookingItem.shortId });

      // Only consider confirmed or pending payments
      if (
        payment &&
        (payment.status === 'Success' || payment.status === 'Pending')
      ) {
        if (
          bookingItem.bookingDetails.roomAssignments &&
          bookingItem.bookingDetails.roomAssignments.length > 0
        ) {
          bookingItem.bookingDetails.roomAssignments.forEach((assignment) => {
            const roomId = assignment.roomId.toString();
            const assignmentDate = new Date(assignment.date);

            if (assignmentDate >= startingDate && assignmentDate < endingDate) {
              if (!roomOccupancyMap.has(roomId)) {
                roomOccupancyMap.set(roomId, new Set());
              }

              const dateString = assignmentDate.toISOString().split('T')[0];
              roomOccupancyMap.get(roomId).add(dateString);
            }
          });
        }
        // FALLBACK
        else if (bookingItem.bookingDetails.selectedRooms) {
          bookingItem.bookingDetails.selectedRooms.forEach((selectedRoom) => {
            const roomId = selectedRoom.id;
            if (!roomOccupancyMap.has(roomId)) {
              roomOccupancyMap.set(roomId, new Set());
            }

            let currentDate = new Date(Math.max(visitDate2, startingDate));
            const maxDate = new Date(Math.min(endDate2, endingDate));

            while (currentDate < maxDate) {
              const dateString = currentDate.toISOString().split('T')[0];
              roomOccupancyMap.get(roomId).add(dateString);
              currentDate.setDate(currentDate.getDate() + 1);
            }
          });
        }
      }
    }
  }

  const numberOfNights = Math.ceil(
    (endingDate - startingDate) / (1000 * 60 * 60 * 24)
  );

  const availableRooms = allRooms.filter((room) => {
    const roomId = room._id.toString();

    if (!roomOccupancyMap.has(roomId)) {
      return true;
    }

    const occupiedDates = roomOccupancyMap.get(roomId);

    let currentDate = new Date(startingDate);
    while (currentDate < endingDate) {
      const dateString = currentDate.toISOString().split('T')[0];

      if (occupiedDates.has(dateString)) {
        return false;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return true;
  });

  res.status(200).json(availableRooms);
});
const getBookingsForRoom = asyncErrorHandler(async (req, res) => {
  const { roomId } = req.params;
  const bookings = await overnightBooking.find({
    'bookingDetails.selectedRooms.id': roomId,
  });
  if (!bookings) {
    return res.status(404).json({ error: 'Bookings not found' });
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
