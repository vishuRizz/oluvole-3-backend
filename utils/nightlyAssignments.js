const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const safeClone = (value) => {
  if (!value || typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
};

const toDate = (input) => {
  if (!input) return null;
  const date = new Date(input);
  if (isNaN(date.getTime())) return null;
  return date;
};

const addDays = (date, days = 1) => {
  if (!(date instanceof Date)) return null;
  return new Date(date.getTime() + days * ONE_DAY_MS);
};

const formatDateKey = (date) => {
  if (!(date instanceof Date)) return null;
  return date.toISOString().split("T")[0];
};

const buildNightlyAssignments = (roomDetails = {}) => {
  if (!roomDetails || typeof roomDetails !== "object") return [];

  const {
    visitDate,
    endDate,
    selectedRooms = [],
    multiNightSelections,
    roomGuestDistribution = {},
  } = roomDetails;

  const assignments = [];
  const pushAssignment = ({ roomId, roomTitle, roomData, startDate }) => {
    if (!roomId || !startDate) return;
    const start = toDate(startDate);
    if (!start) return;
    const end = addDays(start, 1);
    assignments.push({
      roomId: `${roomId}`,
      roomTitle: roomTitle || roomData?.title || "",
      roomData: roomData || null,
      startDate: start.toISOString(),
      endDate: end ? end.toISOString() : start.toISOString(),
      dateKey: formatDateKey(start),
      guestAllocation: roomGuestDistribution?.[roomId] || null,
    });
  };

  const selectedRoomsMap = Array.isArray(selectedRooms)
    ? selectedRooms.reduce((acc, room) => {
        if (room?.id) acc[room.id] = room;
        return acc;
      }, {})
    : {};

  const hasMultiNightSelections =
    multiNightSelections &&
    typeof multiNightSelections === "object" &&
    Object.keys(multiNightSelections).length > 0;

  if (hasMultiNightSelections) {
    Object.entries(multiNightSelections).forEach(
      ([dateKey, nightlyRooms]) => {
        if (!Array.isArray(nightlyRooms)) return;
        nightlyRooms.forEach((nightRoom) => {
          const roomId = nightRoom?.roomId || nightRoom?.room?.id;
          const roomData =
            nightRoom?.room || selectedRoomsMap?.[roomId] || null;
          const startDateValue = nightRoom?.date || dateKey;
          const start = toDate(startDateValue);
          if (!roomId || !start) return;
          pushAssignment({
            roomId,
            roomTitle: roomData?.title || nightRoom?.room?.title,
            roomData,
            startDate: start,
          });
        });
      }
    );

    if (assignments.length) {
      return assignments.sort(
        (a, b) => new Date(a.startDate) - new Date(b.startDate)
      );
    }
  }

  const startDate = toDate(visitDate);
  const endDateValue = toDate(endDate);
  if (!startDate || !endDateValue || startDate >= endDateValue) {
    return [];
  }

  for (
    let cursor = new Date(startDate);
    cursor < endDateValue;
    cursor = addDays(cursor, 1)
  ) {
    const start = cursor.toISOString();
    Array.isArray(selectedRooms) &&
      selectedRooms.forEach((room) => {
        if (!room?.id) return;
        pushAssignment({
          roomId: room.id,
          roomTitle: room.title,
          roomData: room,
          startDate: start,
        });
      });
  }

  return assignments.sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );
};

const normalizeRoomDetails = (roomDetails = {}) => {
  if (!roomDetails || typeof roomDetails !== "object") return roomDetails;
  const clonedDetails = safeClone(roomDetails) || {};
  clonedDetails.nightlyAssignments = buildNightlyAssignments(clonedDetails);
  return clonedDetails;
};

const getStoredNightlyAssignments = (roomDetails = {}) => {
  if (
    roomDetails &&
    Array.isArray(roomDetails.nightlyAssignments) &&
    roomDetails.nightlyAssignments.length > 0
  ) {
    return roomDetails.nightlyAssignments;
  }
  return buildNightlyAssignments(roomDetails);
};

module.exports = {
  buildNightlyAssignments,
  normalizeRoomDetails,
  getStoredNightlyAssignments,
};

