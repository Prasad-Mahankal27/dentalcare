const express = require("express");
const router = express.Router();
const { getSuggestions } = require("../controllers/suggestionController");

router.post("/suggest", getSuggestions);

module.exports = router;
