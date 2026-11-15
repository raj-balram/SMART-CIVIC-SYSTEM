const AppError = require("../utils/AppError");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const describe = (issue) => {
  const field = issue.path.join(".") || "body";
  // a missing field, or the wrong type (e.g. an object where a string is expected)
  if (issue.code === "invalid_type") return `${field} is required and must be valid`;
  return issue.message;
};

const reject = (res, error) => {
  const errors = error.issues.map((i) => ({ field: i.path.join("."), message: describe(i) }));
  return res.status(400).json({ message: errors[0].message, errors });
};

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) return reject(res, result.error);
  req.body = result.data; // cleaned: trimmed, lowercased, converted, unknown fields removed
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) return reject(res, result.error);
  req.validatedQuery = result.data; // Express 5: req.query is read-only, so the cleaned copy lives here
  next();
};

const validateObjectId =
  (param = "id") =>
  (req, res, next) => {
    if (!OBJECT_ID.test(req.params[param])) throw new AppError(400, "Invalid id");
    next();
  };

module.exports = { validateBody, validateQuery, validateObjectId };