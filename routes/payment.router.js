const {
  create,
  getAll,
  getSingle,
  confirm,
  cancel,
  getByBookingId,
  updatePayment,
  deletePaymentAll,
  deletByBookingId,
} = require("../services/payment.service");

const router = require("express").Router();

router.post("/create", create);
router.get("/get", getAll);
router.get("/get/single/:id", getSingle);
router.get("/get/byBookingId/:id", getByBookingId);
router.post("/confirm/:ref", confirm);
router.post("/cancel/:ref", cancel);
router.put("/update/:ref", updatePayment);
router.delete("/delete", deletePaymentAll);
router.delete("/delete/byBookingId/:id", deletByBookingId);

module.exports = router;
