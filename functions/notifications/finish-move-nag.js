// functions/notifications/finish-move-nag.js
// Finish-move repeat is off. An open move sends the valet back to Move & Locate.

const { onSchedule } = require("firebase-functions/v2/scheduler");

const finishMoveNag = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/New_York",
  },
  async () => {
    return;
  },
);

module.exports = {
  finishMoveNag,
};