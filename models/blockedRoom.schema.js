const mongoose = require("mongoose");

const BlockedRoom = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
  },
  roomTitle: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
});
module.exports = mongoose.model("BlockedRoom", BlockedRoom);
