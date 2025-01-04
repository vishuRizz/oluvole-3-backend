const express = require("express");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
require("dotenv").config();
const logger = require("./utils/logger");
const connectDatabase = require("./connection/database");
const { errorMiddleware, ErrorResponse } = require("./middlewares/error/error");
const { statusCode } = require("./utils/statusCode");
const { allRoutes } = require("./routes");
const { termModel } = require("./models");
const { any } = require("joi");
const { RoomTypes, SubRooms } = require("./models/rooms.schema");
const { overnightBooking } = require("./models/overnight.booking.schema");
const app = express();
const port = 4000 || 4001;
connectDatabase();
require("./services/cronService");
app.use(express.json());

app.use(cors({ origin: "*" }));
app.use(morgan("combined", { stream: logger.stream }));

app.use(errorMiddleware); // CUSTOM ERROR MIDDLEWARE

app.get("/health", function (req, res) {
  return res.send("Server Operation Success");
});

app.use(errorMiddleware);
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // CUSTOM ERROR MIDDLEWARE

app.use("/api/v1", allRoutes); // ALL API END POINTS

app.get("/test-error", (req, res) => {
  try {
    throw new Error("This is a test error");
  } catch (error) {
    logger.error("Test error message for email alert", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).send("Test error triggered");
  }
});
// INAVLID API CALL
app.use((req, res, next) => {
  next(new ErrorResponse("Invalid Api", statusCode?.notFound));
});

app.listen(port, () => {
  console.log(`server is running on PORT ${port}`);
});

const del = async () => {
  // await RoomTypes.deleteMany()
  // await SubRooms.deleteMany()
  // await overnightBooking.deleteMany()
};

del();
