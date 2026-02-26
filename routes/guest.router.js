const {
  createGuest,
  getGuest,
  getPaginatedGuests,
  getSingle,
  getGuestByEmail,
} = require("../services/guest.service");
const router = require("express").Router();
const upload = require("../middlewares/fileupload/upload.middleware");

router.post("/create", upload.single("file"), createGuest);
router.get("/get/all", getGuest);
router.get("/get/paginated", getPaginatedGuests);
router.get("/get/single/:id", getSingle);
router.get("/get/email/:email", getGuestByEmail);

module.exports = router;
