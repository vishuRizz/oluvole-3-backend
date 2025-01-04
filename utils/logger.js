const { createLogger, format, transports } = require("winston");
const TransportStream = require("winston-transport");
const DailyRotateFile = require("winston-daily-rotate-file");
const { sendEmail } = require("../config/mail.config");

// Custom transport for email alerts
class EmailAlertTransport extends TransportStream {
  constructor(opts) {
    super(opts); // Initialize the transport
  }

  log(info, callback) {
    // Only handle 'error' level logs
    if (info.level === "error") {
      sendEmail(
        "zekudk@gmail.com", // Your email to receive alerts
        "Application Error Alert",
        "error_alert", // Template name
        {
          timestamp: new Date().toISOString(),
          errorMessage: info.message,
          stackTrace: info.stack || "No stack trace available",
          fullError: JSON.stringify(info, null, 2),
        }
      );
    }

    // Required to indicate that the log was processed
    callback();
  }
}

// Configure the logger
const logger = createLogger({
  level: "info", // Logging levels: 'error', 'warn', 'info', 'debug', etc.
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Add timestamp
    format.errors({ stack: true }), // Include stack traces for errors
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ""
      }`;
    }) // Custom log format
  ),
  transports: [
    // Console transport for development
    // new transports.Console({
    //   format: format.combine(format.colorize(), format.simple()),
    // }),

    // Daily rotation for all logs
    new DailyRotateFile({
      dirname: "logs",
      filename: "application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true, // Compress old log files
      maxSize: "20m", // Max file size
      maxFiles: "14d", // Keep logs for 14 days
    }),

    // Separate error logs
    new DailyRotateFile({
      level: "error",
      dirname: "logs",
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),

    // Add the custom email alert transport
    new EmailAlertTransport(),
  ],
});

// Add a stream object for HTTP request logging with Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
