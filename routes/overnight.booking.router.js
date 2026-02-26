const {
  createBooking,
  getAllBooking,
  getPaginatedBookings,
  getBookingByRef,
  updateBooking,
  updateBookingStatus,
  deletAllBooking,
  deleteBookingByRef,
} = require("../services/overnight.booking.service");

const router = require("express").Router();

const upload = require("../middlewares/fileupload/upload.middleware");
router.post(`/create`, upload.single("file"), createBooking);
router.get(`/get/all`, getAllBooking);
router.get(`/get/paginated`, getPaginatedBookings);
router.get(`/get/:ref`, getBookingByRef);
router.put(`/update/:ref`, upload.single("file"), updateBooking);
router.patch(`/status/:ref`, updateBookingStatus);
router.delete(`/delete/all`, deletAllBooking);
router.delete(`/delete/:ref`, deleteBookingByRef);

module.exports = router;
