module.exports = {
  EVENTS: {
    COMPLAINT_CREATED: "complaint:created",
    COMPLAINT_UPDATED: "complaint:updated",
    COMPLAINT_SUPPORTED: "complaint:supported",
  },
  rooms: {
    admin: "admin",
    user: (id) => `user:${id}`,
  },
};