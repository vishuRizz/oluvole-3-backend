const {
  asyncErrorHandler,
  ErrorResponse,
} = require("../middlewares/error/error");
const { guestModel } = require("../models");
const { statusCode } = require("../utils/statusCode");
const { paginate } = require("../utils/paginate");
const { loyaltyCoinModel } = require("../models/loyaltyPoints");

const asArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [value];
};
const parseMaybeJSON = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const createGuest = asyncErrorHandler(async (req, res) => {
  let guestData = { ...req.body };
  // TEMP DEBUG: confirm multipart file reaches guest create route
  console.log("[TEMP][guest.create] file received:", {
    hasFile: !!req.file,
    filename: req.file?.filename || null,
    mimetype: req.file?.mimetype || null,
    size: req.file?.size || null,
    email: guestData.email || null,
  });

  guestData.visitMetrics = parseMaybeJSON(guestData.visitMetrics, guestData.visitMetrics);
  guestData.preferences = parseMaybeJSON(guestData.preferences, guestData.preferences);
  guestData.keyDates = parseMaybeJSON(guestData.keyDates, guestData.keyDates);
  guestData.guests = parseMaybeJSON(guestData.guests, guestData.guests);
  guestData.keepInfo = toBool(guestData.keepInfo, false);

  if (req.file) {
    guestData.photo = `uploads/${req.file.filename}`;
  }
  if (!guestData.photo && typeof guestData.file === "string" && guestData.file && guestData.file !== "ID ON FILE") {
    guestData.photo = guestData.file;
  }

  // Check if guest exists
  let existingGuest = await guestModel.findOne({ email: guestData.email });

  if (existingGuest) {
    // Update existing guest
    // Increment visit metrics if provided (logic handled by caller or inferred)
    if (guestData.visitMetrics) {
      existingGuest.visitMetrics = {
        dayVisits: (existingGuest.visitMetrics?.dayVisits || 0) + (guestData.visitMetrics.dayVisits || 0),
        overnightStays: (existingGuest.visitMetrics?.overnightStays || 0) + (guestData.visitMetrics.overnightStays || 0)
      };
    }

    // Merge preferences
    if (guestData.preferences) {
      if (guestData.preferences.dietaryRequirements) {
        existingGuest.preferences.dietaryRequirements = [
          ...new Set([...(existingGuest.preferences.dietaryRequirements || []), ...guestData.preferences.dietaryRequirements])
        ];
      }
      if (guestData.preferences.drinkPreferences) {
        existingGuest.preferences.drinkPreferences = [
          ...new Set([...(existingGuest.preferences.drinkPreferences || []), ...guestData.preferences.drinkPreferences])
        ];
      }
      if (guestData.preferences.pastExtras) {
        existingGuest.preferences.pastExtras = [
          ...new Set([...(existingGuest.preferences.pastExtras || []), ...guestData.preferences.pastExtras])
        ];
      }
    }

    // Update key dates if new ones provided
    if (guestData.keyDates) {
      if (guestData.keyDates.dob) existingGuest.keyDates.dob = guestData.keyDates.dob;
      if (guestData.keyDates.anniversary) existingGuest.keyDates.anniversary = guestData.keyDates.anniversary;
    }

    // Update basic info if provided (optional, usually we might keep original or overwrite)
    if (guestData.name) existingGuest.name = guestData.name;
    if (guestData.mobile) existingGuest.mobile = guestData.mobile;
    if (guestData.phone && !guestData.mobile) existingGuest.mobile = guestData.phone;
    if (guestData.gender) existingGuest.gender = guestData.gender;
    if (guestData.firstName || guestData.firstname) existingGuest.firstName = guestData.firstName || guestData.firstname;
    if (guestData.lastName || guestData.lastname) existingGuest.lastName = guestData.lastName || guestData.lastname;
    if (typeof guestData.keepInfo === "boolean") existingGuest.keepInfo = guestData.keepInfo;
    if (guestData.howDidYouFindUs || guestData.aboutUs) existingGuest.howDidYouFindUs = guestData.howDidYouFindUs || guestData.aboutUs;
    if (guestData.photo) existingGuest.photo = guestData.photo;
    if (Array.isArray(guestData.guests)) existingGuest.guests = guestData.guests;
    if (guestData.preferredCommunicationChannel || guestData.communicationPreference) existingGuest.preferredCommunicationChannel = guestData.preferredCommunicationChannel || guestData.communicationPreference;
    if (guestData.guestPersona) existingGuest.guestPersona = guestData.guestPersona;
    if (guestData.specialOccasionNotes) existingGuest.specialOccasionNotes = guestData.specialOccasionNotes;
    if (guestData.theUsual) existingGuest.theUsual = guestData.theUsual;
    if (guestData.lastInteractionSummary) existingGuest.lastInteractionSummary = guestData.lastInteractionSummary;

    await existingGuest.save();
    res.status(statusCode.accepted).json(existingGuest);

  } else {
    // Create new guest
    // Initialize visit metrics if not provided
    if (!guestData.visitMetrics) {
      guestData.visitMetrics = { dayVisits: 0, overnightStays: 0 };
    }
    if (guestData.preferences) {
      guestData.preferences = {
        dietaryRequirements: asArray(guestData.preferences.dietaryRequirements || guestData.para),
        drinkPreferences: asArray(guestData.preferences.drinkPreferences || guestData.drinkPreferences),
        pastExtras: asArray(guestData.preferences.pastExtras),
      };
    } else {
      guestData.preferences = {
        dietaryRequirements: asArray(guestData.para),
        drinkPreferences: asArray(guestData.drinkPreferences),
        pastExtras: [],
      };
    }
    if (!guestData.mobile && guestData.phone) guestData.mobile = guestData.phone;
    if (!guestData.name && (guestData.firstname || guestData.lastname)) {
      guestData.name = `${guestData.firstname || ""} ${guestData.lastname || ""}`.trim();
    }
    if (!guestData.firstName && guestData.firstname) guestData.firstName = guestData.firstname;
    if (!guestData.lastName && guestData.lastname) guestData.lastName = guestData.lastname;
    if (!guestData.howDidYouFindUs && guestData.aboutUs) guestData.howDidYouFindUs = guestData.aboutUs;
    if (!guestData.preferredCommunicationChannel && guestData.communicationPreference) {
      guestData.preferredCommunicationChannel = guestData.communicationPreference;
    }

    let createGuest = await guestModel.create(guestData);
    if (createGuest) {
      res.status(statusCode.accepted).json(createGuest);
    } else {
      throw new ErrorResponse({ message: "Failed To Create Guest" });
    }
  }
});

const getGuest = asyncErrorHandler(async (req, res) => {
  let allGuest = await guestModel.find({}).sort({ createdAt: -1 });

  if (allGuest.length > 0) {
    let loyaltyPoints = await loyaltyCoinModel.find({})
    const loyaltyPointsMap = new Map(loyaltyPoints.map(lp => [lp.email, lp.points]));
    allGuest = allGuest.map(guest => ({
      ...guest.toObject(),
      points: loyaltyPointsMap.get(guest.email) || 0
    }));
    res.status(statusCode.accepted).json(allGuest);
  } else {
    throw new ErrorResponse("No Guest Found", 404);
  }
});

const getPaginatedGuests = asyncErrorHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await paginate(guestModel, {}, { page, limit });

  // Attach loyalty points
  const { loyaltyCoinModel } = require("../models/loyaltyPoints");
  const loyaltyPoints = await loyaltyCoinModel.find({});
  const loyaltyPointsMap = new Map(loyaltyPoints.map(lp => [lp.email, lp.points]));
  result.data = result.data.map(guest => ({
    ...guest.toObject(),
    points: loyaltyPointsMap.get(guest.email) || 0
  }));

  res.status(statusCode.accepted).json(result);
});

const getSingle = asyncErrorHandler(async (req, res) => {
  let guest = await guestModel.findById(req.params.id);
  if (guest) {
    // Attach loyalty points
    const loyaltyPoints = await loyaltyCoinModel.findOne({ email: guest.email });
    const guestObj = guest.toObject();
    guestObj.points = loyaltyPoints?.points || 0;
    res.status(statusCode.accepted).json(guestObj);
  } else {
    throw new ErrorResponse("No Guest Found", 404);
  }
});
const getGuestByEmail = asyncErrorHandler(async (req, res) => {
  let guest = await guestModel.findOne({ email: req.params.email });
  if (guest) {
    res.status(statusCode.accepted).json(guest);
  } else {
    res.status(404).json({ message: "Guest not found" });
  }
});

module.exports = { createGuest, getGuest, getPaginatedGuests, getSingle, getGuestByEmail };
