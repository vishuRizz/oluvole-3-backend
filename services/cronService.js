const cron = require("node-cron");
const { paymentModel } = require("../models");
const { sendEmail } = require("../config/mail.config");
const { SubRooms } = require("../models/rooms.schema");
const { voucherModel } = require("../models");
const { dayPassVouherModel } = require("../models");
const { sendRenewalReminders } = require("./club100.service");
const {
  sendBirthdayEmails,
  BIRTHDAY_TIMEZONE,
} = require("./birthdayEmail.service");
function formatDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate();
  const v = day % 100;
  const suffix = (v - 20) % 10 === 1
    ? "st"
    : (v - 20) % 10 === 2
      ? "nd"
      : (v - 20) % 10 === 3
        ? "rd"
        : v === 1
          ? "st"
          : v === 2
            ? "nd"
            : v === 3
              ? "rd"
              : "th";
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  return `${day}${suffix}, ${month} ${year}`;
}
const formatPrice = (price) => {
  const priceNumber = Number(price);
  return priceNumber.toLocaleString(); // Format the price with commas
};
const calculateNumberOfNights = (visitDate, endDate) => {
  const visitDateObj = new Date(visitDate);
  const endDateObj = new Date(endDate);
  const numberOfNights = Math.floor(
    (endDateObj - visitDateObj) / (1000 * 60 * 60 * 24)
  );
  console.log(numberOfNights);
  return numberOfNights;
};

const counting = (guestCount) => {
  const numChildren = guestCount?.ages?.filter((age) =>
    age.includes("child")
  ).length;
  const numToddlers = guestCount?.ages?.filter((age) =>
    age.includes("toddler")
  ).length;
  const numInfants = guestCount?.ages?.filter((age) =>
    age.includes("infant")
  ).length;

  return {
    adults: guestCount?.adults,
    children: numChildren,
    toddlers: numToddlers,
    infants: numInfants,
  };
};

cron.schedule("* * * * *", async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const pendingPayments = await paymentModel.find({
      status: "Pending",
      updatedAt: { $lte: oneHourAgo },
    });

    for (const payment of pendingPayments) {
      try {
        const safeParse = (data) => {
          if (!data) return null;
          if (typeof data === 'object') return data;
          try {
            return JSON.parse(data);
          } catch (e) {
            return null;
          }
        };

        const guestDetails = safeParse(payment.guestDetails);
        const roomDetails = safeParse(payment.roomDetails);
        const bookingInfo = safeParse(payment.bookingInfo);

        if (!guestDetails || !roomDetails) {
          console.warn(`Skipping payment ${payment._id}: Missing or invalid guestDetails/roomDetails`);
          // Optionally mark it as something else to avoid re-processing invalid data
          payment.status = "Error_InvalidData";
          await payment.save();
          continue;
        }

        if (roomDetails.selectedRooms) {
          for (const room of roomDetails.selectedRooms) {
            await SubRooms.findByIdAndUpdate(room.id, {
              totalRoom: 1,
            });
          }
        }
        payment.status = "Cancelled";
        await payment.save();
        const totalGuests = roomDetails?.visitDate
          ? roomDetails?.selectedRooms?.[0]?.guestCount?.adults +
          counting(roomDetails?.selectedRooms?.[0]?.guestCount).children +
          counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
          counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants
          : bookingInfo?.adultsAlcoholic +
          bookingInfo?.adultsNonAlcoholic +
          bookingInfo?.Nanny +
          bookingInfo?.childTotal;

        const emailContext = {
          name: payment.name,
          email: guestDetails.email,
          id: payment.ref,
          bookingType:
            (roomDetails?.selectedRooms && roomDetails?.selectedRooms.length > 0)
              ? roomDetails.selectedRooms.map((room) => room.title).join(", ")
              : "Day Pass",
          checkIn: roomDetails?.visitDate
            ? `${formatDate(roomDetails?.visitDate)}`
            : `${formatDate(roomDetails?.startDate)}`,
          checkOut: roomDetails?.endDate
            ? `${formatDate(roomDetails?.endDate)}`
            : `${formatDate(roomDetails?.startDate)}`,
          numberOfGuests: roomDetails?.visitDate
            ? `${roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0
            } Adults, ${counting(roomDetails?.selectedRooms?.[0]?.guestCount)
              .children ?? 0
            } Children ${counting(roomDetails?.selectedRooms?.[0]?.guestCount)
              .toddlers ?? 0
            } Toddlers ${counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ??
            0
            } Infants`
            : bookingInfo
              ? `${bookingInfo?.adultsAlcoholic} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic} Adults Non Alcoholic, ${bookingInfo?.Nanny} Nanny, ${bookingInfo?.childTotal} Child`
              : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0
              } Children`,
          numberOfNights: roomDetails?.visitDate
            ? calculateNumberOfNights(
              roomDetails?.visitDate,
              roomDetails?.endDate
            )
            : "Day Pass",
          extras:
            roomDetails?.visitDate && roomDetails?.finalData
              ? roomDetails?.finalData?.map((extra) => ` ${extra.title}`)
              : roomDetails?.startDate && roomDetails?.extras
                ? roomDetails?.extras?.map((extra) => ` ${extra.title}`)
                : "No Extras",
          subTotal: formatPrice(payment.subTotal),
          multiNightDiscount: payment.discount.toLocaleString(),
          clubMemberDiscount: payment.voucher,
          multiNightDiscountAvailable: payment.multiNightDiscount
            ? payment.multiNightDiscount
            : 0,
          vat: formatPrice(payment.vat),
          totalCost: formatPrice(payment.totalCost),
          roomsPrice: payment.roomsPrice
            ? payment.roomsPrice == "Daypass"
              ? payment.roomsPrice
              : formatPrice(payment.roomsPrice)
            : "",
          extrasPrice: payment.extrasPrice
            ? formatPrice(payment.extrasPrice)
            : "",
          roomsDiscount: payment.roomsDiscount
            ? payment.roomsDiscount == "Daypass"
              ? payment.roomsDiscount
              : formatPrice(payment.roomsDiscount)
            : "",
          discountApplied: payment.discountApplied
            ? payment.discountApplied == "true"
              ? "Yes"
              : "No"
            : "",
          voucherApplied: payment.voucherApplied
            ? payment.voucherApplied == "true"
              ? "Yes"
              : "No"
            : "",
          priceAfterVoucher: payment.priceAfterVoucher
            ? formatPrice(payment.priceAfterVoucher)
            : "",
          priceAfterDiscount: payment.priceAfterDiscount
            ? formatPrice(payment.priceAfterDiscount)
            : "",
          totalGuests: totalGuests,
        };
        sendEmail(
          guestDetails.email,
          "Your Booking has been Cancelled",
          "cancellation",
          emailContext
        );
        sendEmail(
          "bookings@jarabeachresort.com",
          "Booking Cancelled",
          "cancellation",
          emailContext
        );
      } catch (err) {
        console.error(`Failed to cancel payment ${payment?._id || 'unknown'}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Critical error in payment cancellation cron:", err.message);
  }
});

// Function to update expired vouchers
const updateExpiredVouchers = async () => {
  try {
    const now = new Date();
    await voucherModel.updateMany(
      {
        $or: [
          { expireAt: { $lt: now }, status: "active" },
          { expireAt: { $lt: now }, status: "Active" },
        ],
      },
      { $set: { status: "expired" } }
    );
    await dayPassVouherModel.updateMany(
      {
        $or: [
          { expireAt: { $lt: now }, status: "active" },
          { expireAt: { $lt: now }, status: "Active" },
        ],
      },
      { $set: { status: "expired" } }
    );
    console.log("Expired vouchers updated successfully");
  } catch (error) {
    console.error("Error updating expired vouchers:", error);
  }
};

// Schedule the task to run daily at midnight
cron.schedule("0 0 * * *", updateExpiredVouchers);

// Note: Post-checkout email cron job removed — replaced by instant survey email on admin checkout action
// (see bookingLogs.router.js PATCH /check-out/:id)

// Schedule the task to run weekly
cron.schedule("0 9 * * 1", sendRenewalReminders); // Runs every Monday at 9:00 AM

// Schedule birthday emails daily at 12:01 AM (resort local time)
cron.schedule("1 0 * * *", sendBirthdayEmails, { timezone: BIRTHDAY_TIMEZONE });


