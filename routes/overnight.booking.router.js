const {
  createBooking,
  getAllBooking,
  getBookingByRef,
  updateBooking,
  deletAllBooking,
} = require("../services/overnight.booking.service");

const router = require("express").Router();

const upload = require("../middlewares/fileupload/upload.middleware");
router.post(`/create`, upload.single("file"), createBooking);
router.get(`/get/all`, getAllBooking);
router.get(`/get/:ref`, getBookingByRef);
router.put(`/update/:ref`, upload.single("file"), updateBooking);
router.delete(`/delete/all`, deletAllBooking);

module.exports = router;
