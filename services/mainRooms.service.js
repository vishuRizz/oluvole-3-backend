const { asyncErrorHandler } = require('../middlewares/error/error');
const { overnightBooking } = require('../models/overnight.booking.schema');
const { RoomTypes, SubRooms } = require('../models/rooms.schema');
const { paymentModel } = require('../models');
const { getStoredNightlyAssignments } = require('../utils/nightlyAssignments');
const BlockedRoom = require('../models/blockedRoom.schema');

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

  let startingDate = new Date(visitDate);
  let endingDate = new Date(endDate);

  // Fix: If checking single day (same checkin/checkout), treat as 1 night stay
  if (startingDate.getTime() === endingDate.getTime()) {
    endingDate = new Date(startingDate);
    endingDate.setDate(endingDate.getDate() + 1);
  }

  console.log('🔍 DEBUG: Query dates:', {
    startingDate: startingDate.toISOString(),
    endingDate: endingDate.toISOString(),
  });

  // FIX: Convert dates to strings for comparison since DB stores them as strings
  const startDateString = startingDate.toISOString().split('T')[0];
  const endDateString = endingDate.toISOString().split('T')[0];

  const [bookings, blockedRooms, allRooms, allPayments] = await Promise.all([
    overnightBooking
      .find({
        $or: [
          {
            'bookingDetails.visitDate': { $lte: endDateString },
            'bookingDetails.endDate': { $gte: startDateString },
          },
          {
            'bookingDetails.roomAssignments.date': {
              $gte: startingDate,
              $lt: endingDate,
            },
          },
        ],
      })
      .lean()
      .select('shortId bookingDetails'),
    BlockedRoom.find({
      date: {
        $gte: startingDate,
        $lt: endingDate,
      },
    })
      .lean()
      .select('roomId date'),
    SubRooms.find({}).populate('roomId').lean(),
    paymentModel.find({}).lean().select('ref status'),
  ]);

  // FIX N+1 PROBLEM: Fetch all payments in one query
  const bookingRefs = bookings.map((b) => b.shortId).filter(Boolean);
  const payments = await paymentModel
    .find({
      ref: { $in: bookingRefs },
      status: { $in: ['Success', 'Pending'] },
    })
    .lean()
    .select('ref status');
  const paymentMap = new Map(payments.map((p) => [p.ref, p]));

  console.log('🔍 DEBUG: Query Range:', {
    startingDate: startingDate.toISOString(),
    endingDate: endingDate.toISOString(),
  });
  console.log('🔍 DEBUG: Total bookings found (all):', bookings.length);
  console.log('🔍 DEBUG: Payments with Success/Pending:', payments.length);
  console.log('🔍 DEBUG: All payment statuses:', allPayments.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {}));

  if (bookings.length > 0) {
    console.log('🔍 DEBUG: All bookings in date range:');
    bookings.forEach((b, idx) => {
      const payment = allPayments.find(p => p.ref === b.shortId);
      console.log(`  ${idx + 1}. Booking ${b.shortId}:`, {
        visitDate: b.bookingDetails?.visitDate,
        endDate: b.bookingDetails?.endDate,
        hasRoomAssignments: !!b.bookingDetails?.roomAssignments,
        roomAssignmentsCount: b.bookingDetails?.roomAssignments?.length || 0,
        selectedRoomsCount: b.bookingDetails?.selectedRooms?.length || 0,
        selectedRoomIds: b.bookingDetails?.selectedRooms?.map(r => r.id) || [],
        paymentStatus: payment?.status || 'NO PAYMENT'
      });
    });
  }

  const roomOccupancyMap = new Map();

  for (const bookingItem of bookings) {
    if (!bookingItem.bookingDetails) {
      console.log(
        'booking details not found for booking with id ',
        bookingItem._id
      );
      continue; // Skip to the next booking
    }

    // Use pre-fetched payment from map
    const payment = paymentMap.get(bookingItem.shortId);

    // Skip if no payment or not confirmed/pending (already filtered in query)
    if (!payment) {
      continue;
    }

    // PRIORITY 1: Use roomAssignments if available (the fix for multi-night bookings)
    if (
      bookingItem.bookingDetails.roomAssignments &&
      bookingItem.bookingDetails.roomAssignments.length > 0
    ) {
      console.log(
        `📋 Booking ${bookingItem.shortId} using roomAssignments (${bookingItem.bookingDetails.roomAssignments.length} assignments)`
      );
      bookingItem.bookingDetails.roomAssignments.forEach((assignment) => {
        const roomId = assignment.roomId.toString();
        const assignmentDate = new Date(assignment.date);

        if (assignmentDate >= startingDate && assignmentDate < endingDate) {
          if (!roomOccupancyMap.has(roomId)) {
            roomOccupancyMap.set(roomId, new Set());
          }

          const dateString = assignmentDate.toISOString().split('T')[0];
          roomOccupancyMap.get(roomId).add(dateString);
          console.log(`  ✓ Marked room ${roomId} as occupied on ${dateString}`);
        }
      });
    }
    // FALLBACK: Use old selectedRooms logic for backwards compatibility
    else if (bookingItem.bookingDetails.selectedRooms) {
      console.log(
        `📋 Booking ${bookingItem.shortId} using selectedRooms (${bookingItem.bookingDetails.selectedRooms.length} rooms)`
      );
      const visitDate2 = new Date(bookingItem.bookingDetails.visitDate);
      const endDate2 = new Date(bookingItem.bookingDetails.endDate);

      // Check if the booking dates overlap with the requested dates
      if (visitDate2 < endingDate && endDate2 > startingDate) {
        bookingItem.bookingDetails.selectedRooms.forEach((selectedRoom) => {
          const roomId = selectedRoom.id.toString();
          if (!roomOccupancyMap.has(roomId)) {
            roomOccupancyMap.set(roomId, new Set());
          }

          let currentDate = new Date(Math.max(visitDate2, startingDate));
          const maxDate = new Date(Math.min(endDate2, endingDate));

          while (currentDate < maxDate) {
            const dateString = currentDate.toISOString().split('T')[0];
            roomOccupancyMap.get(roomId).add(dateString);
            console.log(
              `  ✓ Marked room ${roomId} (${
                selectedRoom.title || 'N/A'
              }) as occupied on ${dateString}`
            );
            currentDate.setDate(currentDate.getDate() + 1);
          }
        });
      } else {
        console.log(`  ⚠️ Booking dates don't overlap with query range`);
      }
    }
  }

  console.log(`🔒 Processing ${blockedRooms.length} blocked room entries`);
  for (const blockedRoom of blockedRooms) {
    const roomId = blockedRoom.roomId.toString();
    const blockedDate = new Date(blockedRoom.date);

    if (!roomOccupancyMap.has(roomId)) {
      roomOccupancyMap.set(roomId, new Set());
    }

    const dateString = blockedDate.toISOString().split('T')[0];
    roomOccupancyMap.get(roomId).add(dateString);
    console.log(`  🔒 Blocked: Room ${roomId} on ${dateString} (Reason: ${blockedRoom.description || 'N/A'})`);
  }

  const numberOfNights = Math.ceil(
    (endingDate - startingDate) / (1000 * 60 * 60 * 24)
  );

  console.log('🔍 DEBUG: Total rooms before filter:', allRooms.length);
  console.log('🔍 DEBUG: Rooms in occupancy map:', roomOccupancyMap.size);
  console.log('🔍 DEBUG: Blocked rooms count:', blockedRooms.length);

  const availableRooms = allRooms.filter((room) => {
    const roomId = room._id.toString();
    const roomTitle = room.roomId?.title || 'Unknown';

    if (!roomOccupancyMap.has(roomId)) {
      return true;
    }

    const occupiedDates = roomOccupancyMap.get(roomId);

    let currentDate = new Date(startingDate);
    while (currentDate < endingDate) {
      const dateString = currentDate.toISOString().split('T')[0];

      if (occupiedDates.has(dateString)) {
        console.log(
          `🚫 Room ${roomTitle} (${roomId}) is occupied on ${dateString}`
        );
        return false;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return true;
  });

  console.log('✅ DEBUG: Available rooms after filter:', availableRooms.length);
  res.status(200).json(availableRooms);
});
const getBookingsForRoom = asyncErrorHandler(async (req, res) => {
  const { roomId } = req.params;
  const bookings = await overnightBooking
    .find({
      'bookingDetails.selectedRooms.id': roomId,
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
