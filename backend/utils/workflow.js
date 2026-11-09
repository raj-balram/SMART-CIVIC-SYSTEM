const CATEGORIES = ["Road", "Garbage", "Electricity", "Water", "Other"];
const STATUSES = ["Pending", "In Progress", "Resolved"];

// the only allowed status changes: from -> list of allowed targets
const TRANSITIONS = {
  Pending: ["In Progress"],
  "In Progress": ["Pending", "Resolved"],
  Resolved: ["In Progress"], // reopen
};

// every status from which `to` can be reached
const allowedFrom = (to) => STATUSES.filter((from) => TRANSITIONS[from].includes(to));

// GeoJSON stores LONGITUDE first, then latitude
const toGeoPoint = (lat, lng) => ({ type: "Point", coordinates: [lng, lat] });

const OPEN_STATUSES = ["Pending", "In Progress"];

// hours a complaint may stay open before it counts as overdue, by category
const SLA_HOURS = { Road: 72, Garbage: 24, Electricity: 24, Water: 24, Other: 120 };

const dueAtFor = (category, from = new Date()) =>
  new Date(from.getTime() + SLA_HOURS[category] * 60 * 60 * 1000);

module.exports = { CATEGORIES, STATUSES, TRANSITIONS, OPEN_STATUSES, SLA_HOURS, allowedFrom, dueAtFor, toGeoPoint };