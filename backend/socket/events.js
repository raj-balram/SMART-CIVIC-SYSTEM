module.exports = {
  EVENTS: {
    COMPLAINT_CREATED: "complaint:created",
    COMPLAINT_UPDATED: "complaint:updated",
    COMPLAINT_SUPPORTED: "complaint:supported",
    COMPLAINT_OVERDUE: "complaint:overdue",
  },
  rooms: {
    admin: "admin",
    user: (id) => `user:${id}`,
  },
};