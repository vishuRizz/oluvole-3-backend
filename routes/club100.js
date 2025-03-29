const {
  registerClubMember,
  validateClubMember,
} = require("../services/club100.service");
const router = require("express").Router();

router.post("/register", registerClubMember); // REGISTER
router.post("/validate", validateClubMember); // VALIDATE

module.exports = router;
