const express = require("express");
const router = express.Router();
const BlockedRoomService = require("../services/blockedRoom.service");

router.get("/get", BlockedRoomService.getAllBlockedRooms);
router.post("/create", BlockedRoomService.createBlockedRoom);
router.post("/update/:id", BlockedRoomService.updateBlockedRoom);
router.delete("/delete/:id", BlockedRoomService.deleteBlockedRoom);

module.exports = router;
