const { overnightBooking } = require('../models/overnight.booking.schema');
const BlockedRoom = require('../models/blockedRoom.schema');
const logger = require('./logger');

async function checkRoomAvailability(roomIds, startDate, endDate) {
  try {
    if (!roomIds || roomIds.length === 0) {
      return {
        available: false,
        conflicts: [],
        message: 'No rooms provided for availability check',
      };
    }

    if (!startDate || !endDate) {
      return {
        available: false,
        conflicts: [],
        message: 'Start date and end date are required',
      };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (start >= end) {
      return {
        available: false,
        conflicts: [],
        message: 'End date must be after start date',
      };
    }

    const conflicts = [];

    const bookingDates = [];
    let currentDate = new Date(start);
    while (currentDate < end) {
      bookingDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    logger.info('Checking availability', {
      roomIds,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      datesCount: bookingDates.length,
    });

    for (const roomId of roomIds) {
      for (const date of bookingDates) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const blockedRoom = await BlockedRoom.findOne({
          roomId: roomId,
          date: {
            $gte: dayStart,
            $lte: dayEnd,
          },
        });

        if (blockedRoom) {
          conflicts.push({
            type: 'manual_block',
            roomId: roomId,
            roomTitle: blockedRoom.roomTitle,
            date: date.toISOString().split('T')[0],
            reason: blockedRoom.description,
            guestName: blockedRoom.guestName || 'N/A',
            details: blockedRoom,
          });
        }
      }

      const existingBookings = await overnightBooking.find({
        'bookingDetails.selectedRooms.id': roomId,
      });

      for (const booking of existingBookings) {
        const bookingDetails = booking.bookingDetails;

        if (!bookingDetails.visitDate || !bookingDetails.endDate) {
          continue;
        }

        const existingStart = new Date(bookingDetails.visitDate);
        const existingEnd = new Date(bookingDetails.endDate);

        existingStart.setHours(0, 0, 0, 0);
        existingEnd.setHours(0, 0, 0, 0);

        if (start < existingEnd && end > existingStart) {
          const roomInfo = bookingDetails.selectedRooms?.find(
            (r) => r.id === roomId
          );
          conflicts.push({
            type: 'existing_booking',
            roomId: roomId,
            roomTitle: roomInfo?.title || 'Unknown Room',
            bookingRef: booking.shortId,
            existingStart: existingStart.toISOString().split('T')[0],
            existingEnd: existingEnd.toISOString().split('T')[0],
            guestName:
              booking.guestDetails?.firstname +
                ' ' +
                booking.guestDetails?.lastname || 'N/A',
            details: booking,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      const conflictMessages = conflicts.map((c) => {
        if (c.type === 'manual_block') {
          return `${c.roomTitle} is blocked on ${c.date} (${c.reason})`;
        } else {
          return `${c.roomTitle} is already booked from ${c.existingStart} to ${c.existingEnd} (Ref: ${c.bookingRef})`;
        }
      });

      logger.warn('Room availability check failed', {
        roomIds,
        conflicts: conflicts.length,
        conflictDetails: conflicts,
      });

      return {
        available: false,
        conflicts: conflicts,
        message: `Room(s) not available: ${conflictMessages.join('; ')}`,
      };
    }

    logger.info('Room availability check passed', {
      roomIds,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    return {
      available: true,
      conflicts: [],
      message: 'All rooms are available for the selected dates',
    };
  } catch (error) {
    logger.error('Error checking room availability', {
      error: error.message,
      stack: error.stack,
      roomIds,
      startDate,
      endDate,
    });

    return {
      available: false,
      conflicts: [],
      message: `Error checking availability: ${error.message}`,
    };
  }
}

async function checkMultiNightAvailability(multiNightSelections) {
  try {
    if (
      !multiNightSelections ||
      Object.keys(multiNightSelections).length === 0
    ) {
      return {
        available: false,
        conflicts: [],
        message: 'No multi-night selections provided',
      };
    }

    const allConflicts = [];

    for (const [dateStr, selections] of Object.entries(multiNightSelections)) {
      const date = new Date(dateStr);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const roomIds = selections.map((s) => s.roomId);

      const result = await checkRoomAvailability(roomIds, date, nextDay);

      if (!result.available) {
        allConflicts.push(...result.conflicts);
      }
    }

    if (allConflicts.length > 0) {
      return {
        available: false,
        conflicts: allConflicts,
        message: `Some rooms are not available for the selected dates`,
      };
    }

    return {
      available: true,
      conflicts: [],
      message: 'All rooms are available for all selected dates',
    };
  } catch (error) {
    logger.error('Error checking multi-night availability', {
      error: error.message,
      stack: error.stack,
    });

    return {
      available: false,
      conflicts: [],
      message: `Error checking availability: ${error.message}`,
    };
  }
}

module.exports = {
  checkRoomAvailability,
  checkMultiNightAvailability,
};
