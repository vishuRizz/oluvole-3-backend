const {
  registerClubMember,
  validateClubMember, getClubMembers,
  updateClubMembers, deleteClubMember
} = require("../services/club100.service");
const router = require("express").Router();

router.post("/register", registerClubMember); // REGISTER
router.post("/validate", validateClubMember); // VALIDATE

router.get("/members", getClubMembers); // Get members

router.patch("/update/:id", updateClubMembers); // Update data of members

router.delete("/delete/:id", deleteClubMember); // Delete member

module.exports = router;
