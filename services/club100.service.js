const { AdminLogEvent } = require("./adminLogs.service.js");
const {
  ErrorResponse,
  asyncErrorHandler,
} = require("../middlewares/error/error");
const { clubModel } = require("../models");
const {sendEmail} = require("../config/mail.config");

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
    return res.status(201).send({ success: false, message: "Club100 Member Already Exits." });
    // throw new ErrorResponse("Club100 Member Already Exits", 400);
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

      sendEmail(
          email, // email of club member...
          "Welcome to Club100 – Your Exclusive Gateway to Unmatched Value at Jara Beach Resort!",
          "welcome_club_member", // Template name
          {
              memberName: name,
              email: email,
          }
      );

    res.status(201).send({ success: true, message: "Club100 Member registered successfully." });
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

// get all member
const getClubMembers = asyncErrorHandler(async (req, res) => {
    const members = await clubModel.find();
    if (!members) {
        throw new ErrorResponse("No Club100 Members found", 404);
    }
    res.status(200).json({
        message: "Club100 Members fetched successfully.",
        members,
    });
})

const updateClubMembers = asyncErrorHandler(async (req, res) => {
    const { id } = req.params; // Extract the member ID from the URL
    const { email, validUntil, active } = req.body; // Extract updated data from the request body

    try {
        // Find the member by ID and update the fields
        const updatedMember = await clubModel.findByIdAndUpdate(
            id,
            { email, validUntil, active },
            { new: true, runValidators: true } // Return the updated document and validate the data
        );

        if (!updatedMember) {
            return res.status(404).json({ message: "Club100 Member not found" });
        }

        res.status(200).json({
            message: "Club100 Member updated successfully",
            updatedMember,
        });
    } catch (error) {
        res.status(500).json({ message: "Error updating Club100 Member", error: error.message });
    }
});

// Function to send renewal reminders
const sendRenewalReminders = async () => {
    try {
        const now = new Date();
        const twoMonthsFromNow = new Date();
        twoMonthsFromNow.setMonth(now.getMonth() + 2);

        // Find members whose membership is expiring within two months
        const expiringMembers = await clubModel.find({
            validUntil: { $lte: twoMonthsFromNow, $gte: now },
        });

        for (const member of expiringMembers) {
            // Check if the last reminder was sent more than a week ago
            if (
                !member.lastRenewalReminder ||
                new Date(member.lastRenewalReminder) <= new Date(now - 7 * 24 * 60 * 60 * 1000)
            ) {
                // Send the renewal reminder email
                await sendEmail(
                    member.email,
                    "Renew Your Club100 Membership",
                    "renewal_club_member", // Template name
                    {
                        memberName: member.name,
                        validUntil: member.validUntil.toDateString(),
                    }
                );

                // Update the lastRenewalReminder field
                member.lastRenewalReminder = now;
                await member.save();
            }
        }

        console.log("Renewal reminders sent successfully.");
    } catch (error) {
        console.error("Error sending renewal reminders:", error);
    }
};

module.exports = {
  registerClubMember,
  validateClubMember,
  getClubMembers,
  updateClubMembers,
  sendRenewalReminders
};
