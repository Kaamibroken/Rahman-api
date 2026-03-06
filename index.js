const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORT ALL PANELS ---
const goat = require("./api/goat");
const np = require("./api/np");
const ts = require("./api/ts");
const msi = require("./api/msi");
const roxy = require("./api/roxy");  // <-- NEW

// --- ROUTES ---
app.use("/api/goat", goat);
app.use("/api/np", np);
app.use("/api/ts", ts);
app.use("/api/msi", msi);
app.use("/api/roxy", roxy); // <-- NEW

// --- HEALTH CHECK ---
app.get("/", (req,res)=> res.send("API RUNNING ✅"));

// --- START SERVER ---
app.listen(PORT, "0.0.0.0", ()=>console.log(`🚀 Server running on port ${PORT}`));
