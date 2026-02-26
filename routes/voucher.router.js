const {
  createVoucher,
  getAll,
  getPaginatedVouchers,
  deleteVoucher,
  validateVoucher,
} = require("../services/voucher.service");

const router = require("express").Router();

router.post("/create", createVoucher);
router.get("/get", getAll);
router.get("/get/paginated", getPaginatedVouchers);
router.delete("/delete/:id", deleteVoucher);
router.post("/validate", validateVoucher);

module.exports = router;
