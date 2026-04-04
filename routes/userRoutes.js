const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  getProfile, updateProfile,
  addWallet, saveUpi,
  addAddress, getAddresses,
  addEmergencyContact,
  submitSupport, buyPass,
} = require("../controllers/userController");

router.get("/profile", auth, getProfile);
router.put("/profile", auth, updateProfile);
router.post("/wallet/add", auth, addWallet);
router.post("/payment/upi", auth, saveUpi);
router.post("/addresses", auth, addAddress);
router.get("/addresses", auth, getAddresses);
router.post("/emergency-contacts", auth, addEmergencyContact);
router.post("/support", auth, submitSupport);
router.post("/pass/buy", auth, buyPass);

module.exports = router;
