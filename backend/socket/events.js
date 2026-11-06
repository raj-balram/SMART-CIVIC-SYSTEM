module.exports = {
  EVENTS: {
    COMPLAINT_CREATED: "complaint:created",
    COMPLAINT_UPDATED: "complaint:updated",
  },
  rooms: {
    admin: "admin",
    user: (id) => `user:${id}`,
  },
};