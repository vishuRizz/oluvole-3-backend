const multer = require("multer");
const path = require("path");
const fs = require("fs");
const logger = require("../../utils/logger");

const uploadsDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter(req, file, cb) {
    if (!file) {
      logger.error("No file uploaded");
      return cb(new Error("No file uploaded!"));
    }
    cb(null, true);
  },
});

module.exports = upload;
