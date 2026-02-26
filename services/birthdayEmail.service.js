const { guestModel } = require("../models");
const { sendEmail } = require("../config/mail.config");

const BIRTHDAY_TIMEZONE = process.env.BIRTHDAY_EMAIL_TIMEZONE || "Africa/Lagos";

const getMonthDayInTimezone = (dateValue, timeZone) => {
  const date = new Date(dateValue);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { month, day };
};

const sendBirthdayEmails = async () => {
  try {
    const now = new Date();
    const { month: todayMonth, day: todayDay } = getMonthDayInTimezone(
      now,
      BIRTHDAY_TIMEZONE
    );
    const currentYear = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: BIRTHDAY_TIMEZONE,
        year: "numeric",
      }).format(now)
    );

    const guestsWithDob = await guestModel
      .find({
        email: { $exists: true, $ne: "" },
        "keyDates.dob": { $ne: null },
      })
      .select("name firstName email keyDates.dob birthdayLastSentYear");

    for (const guest of guestsWithDob) {
      const { month, day } = getMonthDayInTimezone(
        guest.keyDates?.dob,
        BIRTHDAY_TIMEZONE
      );

      const isBirthdayToday = month === todayMonth && day === todayDay;
      const alreadySentThisYear =
        Number(guest.birthdayLastSentYear) === currentYear;

      if (!isBirthdayToday || alreadySentThisYear) continue;

      const recipientName =
        guest.firstName || guest.name || guest.email.split("@")[0] || "Guest";

      try {
        await sendEmail(
          guest.email,
          "Happy Birthday from Jara Beach Resort",
          "birthday_email",
          { name: recipientName, email: guest.email }
        );

        await guestModel.updateOne(
          { _id: guest._id },
          {
            $set: {
              birthdayReminded: true,
              birthdayLastSentYear: currentYear,
            },
          }
        );
      } catch (error) {
        console.error(
          `Failed to send birthday email to ${guest.email}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error("Birthday email cron failed:", error.message);
  }
};

module.exports = {
  sendBirthdayEmails,
  BIRTHDAY_TIMEZONE,
};

