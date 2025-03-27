const { registerClubMember } = require("../services/club100.service");
const router = require("express").Router();

router.post("/register", registerClubMember); // REGISTER

module.exports = router;
