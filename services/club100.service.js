const { AdminLogEvent } = require("./adminLogs.service");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");
const { clubModel } = require("../models");

// Register a new Club100 member
const registerClubMember = asyncErrorHandler(async (req, res) => {
  const { name, email, clubID, validUntil } = req.body;
  let findMember = await clubModel.findOne({ email });

  if (findMember) {
    AdminLogEvent(
      email,
      "None",
      "Register",
      "Failed",
      "Club100 Member Already exist",
      "None"
    );
    throw new ErrorResponse("Club100 Member Already Exits", 400);
  } else {
    const registerMember = await clubModel.create({
      name,
      email,
      clubID,
      validUntil,
    });

    AdminLogEvent(
      registerMember._id,
      "None",
      "Register",
      "Success",
      `New Club100 Member Registered (${email})`,
      "None"
    );

    res
      .status(201)
      .send({ message: "Club100 Member registered successfully." });
  }
});

// Validate a Club100 member
const validateClubMember = asyncErrorHandler(async (req, res) => {
  const { clubID, email } = req.body;
  const member = await clubModel.findOne({ clubID, email });
  if (!member) {
    throw new ErrorResponse("Club100 Member not found", 404);
  }
  res.status(200).json({
    message: "Club100 Member validated successfully.",
    percentage: {
      peakDiscount: 10,
      offPeakDiscount: 20,
    },
  });
});

module.exports = {
  registerClubMember,
  validateClubMember,
};
