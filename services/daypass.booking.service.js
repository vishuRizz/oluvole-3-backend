const { daypassBooking } = require("../models/overnight.booking.schema");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");
const { paginate } = require("../utils/paginate");
const logger = require("../utils/logger");
const Guest = require("../models/guest.schema");
const { processGuestVisit } = require("../utils/guestManager");
const { uploadToCloudinary } = require("../config/cloudinary");
const path = require("path");
const fs = require("fs");

const createBooking = asyncErrorHandler(async (req, res) => {
  try {
    console.log("coming details", req.body);
    let { guestCount, guestDetails, roomDetails, ref } = req.body;
    guestDetails = JSON.parse(guestDetails);
    roomDetails = JSON.parse(roomDetails);
    guestCount = JSON.parse(guestCount);
    const file = req.file;
    const fileData = file ? file.filename : "no file";
    if (!guestCount || !guestDetails || !roomDetails) {
      logger.error("Invalid Booking Data", { body: req.body, file: fileData });
      throw new ErrorResponse("Invalid request", 400);
    }
    logger.info("Booking initiated", { email: guestDetails.email });

    let fileUrl = null;

    // 1) If a new file is uploaded, push it to Cloudinary
    if (file) {
      try {
        const absolutePath = path.resolve(file.path || path.join("uploads", file.filename));
        const uploadResult = await uploadToCloudinary(absolutePath, {
          folder: "jara-resort/guest-ids",
        });
        fileUrl = uploadResult.secure_url || uploadResult.url;

        // Best effort: remove local temp file
        fs.unlink(absolutePath, () => {});
      } catch (cloudErr) {
        logger.error("Cloudinary upload failed for daypass booking", {
          error: cloudErr.message,
          email: guestDetails.email,
        });
      }
    }

    // 2) Fallbacks if no fresh upload or Cloudinary failed
    if (!fileUrl) {
      if (typeof guestDetails.photo === "string" && guestDetails.photo) {
        fileUrl = guestDetails.photo;
      } else if (
        typeof guestDetails.file === "string" &&
        guestDetails.file !== "ID ON FILE"
      ) {
        fileUrl = guestDetails.file;
      } else if (guestDetails.email) {
        const existingGuest = await Guest.findOne({
          email: guestDetails.email,
        }).select("photo");
        fileUrl = existingGuest?.photo || null;
      }
    }
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
      status: req.body.status || 'Pending',
      idPhotoUrl: fileUrl || "",
    });

    // Keep guest profile synced from booking data; don't increment visit count here.
    try {
      await processGuestVisit(
        {
          ...updatedGuestDetails,
          email: updatedGuestDetails.email,
          name: `${updatedGuestDetails.firstname || ""} ${updatedGuestDetails.lastname || ""}`.trim(),
        },
        false,
        { incrementVisit: false }
      );
    } catch (guestErr) {
      logger.error("Failed to sync guest profile on daypass booking create", {
        error: guestErr.message,
        email: updatedGuestDetails?.email,
      });
    }

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

const getPaginatedDaypassBookings = asyncErrorHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paginate(daypassBooking, {}, { page, limit });
  res.status(200).json(result);
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
  getPaginatedDaypassBookings,
  getBookingByRef,
  deletAllBooking,
};
