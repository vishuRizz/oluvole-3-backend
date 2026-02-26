const {
  createDiscount,
  getAll,
  getPaginatedDiscounts,
  deleteDiscount,
  validateDiscount,
} = require("../services/discount.service");

const router = require("express").Router();

router.post("/create", createDiscount);
router.get("/get", getAll);
router.get("/get/paginated", getPaginatedDiscounts);
router.delete("/delete/:id", deleteDiscount);
router.post("/validate", validateDiscount);

module.exports = router;
