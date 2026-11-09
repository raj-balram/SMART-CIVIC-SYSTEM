const { z } = require("zod");
const { CATEGORIES, STATUSES } = require("../utils/workflow");


const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254, "Email is too long");
const name = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(60, "Name must be 60 characters or fewer");

// multipart form fields arrive as strings, so convert them and check the range
const coordinate = (label, min, max) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isFinite(Number(v)), `${label} must be a number`)
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `${label} must be between ${min} and ${max}`)
        .max(max, `${label} must be between ${min} and ${max}`)
    );

const registerSchema = z.object({
  name,
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected, not silently cut
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be 72 characters or fewer"),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(200, "Password is too long"),
});

const updateProfileSchema = z.object({ name });

const createComplaintSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(100, "Title must be 100 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(500, "Description must be 500 characters or fewer"),
  category: z.enum(CATEGORIES, { message: `Category must be one of: ${CATEGORIES.join(", ")}` }),
  lat: coordinate("Latitude", -90, 90),
  lng: coordinate("Longitude", -180, 180),
});

const updateStatusSchema = z.object({
  status: z.enum(STATUSES, { message: `Status must be one of: ${STATUSES.join(", ")}` }),
  note: z.string().trim().max(200, "Note must be 200 characters or fewer").optional(),
});

const nearbyQuerySchema = z.object({
  lat: coordinate("Latitude", -90, 90),
  lng: coordinate("Longitude", -180, 180),
  radius: z
    .string()
    .trim()
    .default("200")
    .refine((v) => v !== "" && Number.isFinite(Number(v)), "Radius must be a number")
    .transform(Number)
    .pipe(
      z
        .number()
        .min(10, "Radius must be between 10 and 5000 metres")
        .max(5000, "Radius must be between 10 and 5000 metres")
    ),
  category: z.enum(CATEGORIES, { message: `Category must be one of: ${CATEGORIES.join(", ")}` }).optional(),
});

const SORTS = ["newest", "oldest", "status", "support"];

// query-string numbers arrive as text
const intParam = (label, min, max, fallback) =>
  z
    .string()
    .trim()
    .default(String(fallback))
    .refine((v) => /^\d+$/.test(v), `${label} must be a whole number`)
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `${label} must be between ${min} and ${max}`)
        .max(max, `${label} must be between ${min} and ${max}`)
    );

const adminListQuerySchema = z.object({
  page: intParam("Page", 1, 100000, 1),
  limit: intParam("Limit", 1, 100, 20),
  status: z.enum(STATUSES, { message: `Status must be one of: ${STATUSES.join(", ")}` }).optional(),
  category: z.enum(CATEGORIES, { message: `Category must be one of: ${CATEGORIES.join(", ")}` }).optional(),
  sort: z.enum(SORTS, { message: `Sort must be one of: ${SORTS.join(", ")}` }).default("newest"),
  q: z.string().trim().min(2, "Search must be at least 2 characters").max(100, "Search must be 100 characters or fewer").optional(),
});

module.exports = {
  CATEGORIES,
  STATUSES,
  registerSchema,
  loginSchema,
  updateProfileSchema,
  createComplaintSchema,
  updateStatusSchema,
  nearbyQuerySchema,
  adminListQuerySchema,
};