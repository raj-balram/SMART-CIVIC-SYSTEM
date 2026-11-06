const AppError = require("../utils/AppError");

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl.split("?")[0]}` });
}

// Express recognises an error handler by its 4 parameters, so keep all of them
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) return res.status(err.status).json({ message: err.message });

  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Image is too large" });
    return res.status(400).json({ message: "Invalid file upload" });
  }
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Malformed JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
  if (err.code === 11000) return res.status(409).json({ message: "Resource already exists" });
  if (err.name === "CastError") return res.status(400).json({ message: "Invalid id" });

  // anything else is a bug: log the details here, but never send them to the client
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
}

module.exports = { notFound, errorHandler };