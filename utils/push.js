const webpush = require("web-push");

const subscriptions = {};

const init = () => {
  webpush.setVapidDetails(
    "mailto:admin@chalterho.com",
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
};

exports.saveSubscription = (userId, subscription) => {
  subscriptions[userId] = subscription;
};

exports.sendNotification = async (userId, payload) => {
  try {
    init();
    const sub = subscriptions[userId];
    if (!sub) return;
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    console.error("Push error:", err.message);
  }
};

exports.getVapidPublic = () => process.env.VAPID_PUBLIC;
