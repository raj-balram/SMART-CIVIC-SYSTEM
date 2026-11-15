const AppError = require("../utils/AppError");

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) throw new AppError(403, "Access denied");
    next();
  };

module.exports = requireRole;