const {
  createBooking,
  getAllBooking,
  getPaginatedDaypassBookings,
  getBookingByRef,
  deletAllBooking,
} = require("../services/daypass.booking.service");

const router = require("express").Router();
const upload = require("../middlewares/fileupload/upload.middleware");

router.post(`/create`, upload.single("file"), createBooking);
router.get(`/get/all`, getAllBooking);
router.get(`/get/paginated`, getPaginatedDaypassBookings);
router.get(`/get/:ref`, getBookingByRef);
router.delete(`/delete/all`, deletAllBooking);

module.exports = router;
