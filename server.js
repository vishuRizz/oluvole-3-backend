const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
require('dotenv').config();
const logger = require('./utils/logger');
const connectDatabase = require('./connection/database');
const { errorMiddleware, ErrorResponse } = require('./middlewares/error/error');
const { statusCode } = require('./utils/statusCode');
const { allRoutes } = require('./routes');
const app = express();
const port = 4000 || 4001;
connectDatabase();
require('./services/cronService');

// Add express.json with raw body capture for Squad webhook
app.use(
  '/api/v1/squad/webhook',
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Use express.json for all other routes
app.use(express.json());

app.use(cors({ origin: '*' }));
app.use(morgan('combined', { stream: logger.stream }));

// Static file serving should be before API routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', function (req, res) {
  return res.send('Server Operation Success');
});

app.use('/api/v1', allRoutes); // ALL API END POINTS

app.get('/test-error', (req, res) => {
  try {
    throw new Error('This is a test error');
  } catch (error) {
    logger.error('Test error message for email alert', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).send('Test error triggered');
  }
});
// INVALID API CALLs
app.use((req, res, next) => {
  next(new ErrorResponse('Invalid Api', statusCode?.notFound));
});

// Error middleware should be last
app.use(errorMiddleware);

const server = app.listen(port, () => {
  console.log(`server is running on PORT ${port}`);

  if (process.send) {
    process.send('ready');
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
});

const del = async () => {
  // await RoomTypes.deleteMany()
  // await SubRooms.deleteMany()
  // await overnightBooking.deleteMany()
};

del();
