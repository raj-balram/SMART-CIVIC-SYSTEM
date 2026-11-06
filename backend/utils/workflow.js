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

module.exports = { CATEGORIES, STATUSES, TRANSITIONS, allowedFrom, toGeoPoint };