const cron = require("node-cron");
const { paymentModel } = require("../models");
const { sendEmail } = require("../config/mail.config");
const { SubRooms } = require("../models/rooms.schema");
const { voucherModel } = require("../models");
const { dayPassVouherModel } = require("../models");
function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: "numeric", month: "long", day: "numeric" };
  const formattedDate = date.toLocaleDateString("en-US", options);
  return formattedDate;
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
        const guestDetails = JSON.parse(payment.guestDetails);
        const roomDetails = JSON.parse(payment.roomDetails);
        const bookingInfo = payment.bookingInfo
          ? JSON.parse(payment.bookingInfo)
          : null;

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
            roomDetails?.selectedRooms?.map((room) => ` ${room.title}`) ||
            "Day Pass",
          checkIn: roomDetails?.visitDate
            ? `${formatDate(roomDetails?.visitDate)}, (2pm)`
            : `${roomDetails?.startDate}, (12noon)`,
          checkOut: roomDetails?.endDate
            ? `${formatDate(roomDetails?.endDate)}, (11am)`
            : `${roomDetails?.startDate}, (6pm)`,
          numberOfGuests: roomDetails?.visitDate
            ? `${
                roomDetails?.selectedRooms?.[0]?.guestCount?.adults ?? 0
              } Adults, ${
                counting(roomDetails?.selectedRooms?.[0]?.guestCount)
                  .children ?? 0
              } Children ${
                counting(roomDetails?.selectedRooms?.[0]?.guestCount)
                  .toddlers ?? 0
              } Toddlers ${
                counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants ??
                0
              } Infants`
            : bookingInfo
            ? `${bookingInfo?.adultsAlcoholic} Adults Alcoholic, ${bookingInfo?.adultsNonAlcoholic} Adults Non Alcoholic, ${bookingInfo?.Nanny} Nanny, ${bookingInfo?.childTotal} Child`
            : `${roomDetails?.adultsCount ?? 0} Adults, ${
                roomDetails?.childrenCount ?? 0
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
        console.log("failed to cancel");
      }
    }
  } catch (err) {
    console.log("failed to cancel");
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

// Schedule the task to run every day at 12 noon for post-checkout emails
cron.schedule("0 12 * * *", async () => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const payments = await paymentModel.find({ status: "Success" });
    // Filter payments based on the endDate inside the roomDetails JSON
    const filteredPayments = payments.filter((payment) => {
      return JSON.parse(payment.roomDetails)?.endDate === today; // Check if the endDate matches
    });

    filteredPayments.forEach((payment) => {
      const guestDetails = JSON.parse(payment.guestDetails);
      const emailContext = {
        name: payment.name,
      };

      sendEmail(
        guestDetails.email,
        "Thanks for choosing Jara Beach Resort 🌴",
        "post_checkout_email",
        emailContext
      );
    });

    console.log("Post Checkout Emails sent to users checking out today.");
  } catch (error) {
    console.error("Error sending post checkout emails:", error);
  }
});
