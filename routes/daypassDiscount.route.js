const {
  createDiscount,
  getAll,
  deleteDiscount,
  validateDiscount,
  getPaginated,
} = require("../services/discountDaypass.service");

const router = require("express").Router();

router.post("/create", createDiscount);
router.get("/get", getAll);
router.get("/paginated", getPaginated);
router.delete("/delete/:id", deleteDiscount);

router.post("/validate", validateDiscount);
// router.delete("/update/:id",updateStaff)

module.exports = router;
