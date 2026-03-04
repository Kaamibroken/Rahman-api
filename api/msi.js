const express = require("express");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const querystring = require("querystring");

const router = express.Router();

const CONFIG = {
  baseUrl: "http://145.239.130.45/ints",
  username: "Rahman526",
  password: "MrRahman",
  userAgent:
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Safari/537.36"
};

let cookies = [];

/* ================= SAFE JSON ================= */

function safeJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Invalid JSON from server" };
  }
}

/* ================= REQUEST ================= */

function request(method, url, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;

    const headers = {
      "User-Agent": CONFIG.userAgent,
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate",
      Cookie: cookies.join("; "),
      ...extraHeaders
    };

    if (method === "POST" && data) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = lib.request(url, { method, headers }, res => {
      if (res.headers["set-cookie"]) {
        res.headers["set-cookie"].forEach(c => {
          cookies.push(c.split(";")[0]);
        });
      }

      let chunks = [];

      res.on("data", d => chunks.push(d));

      res.on("end", () => {
        let buffer = Buffer.concat(chunks);

        try {
          if (res.headers["content-encoding"] === "gzip")
            buffer = zlib.gunzipSync(buffer);
        } catch {}

        resolve(buffer.toString());
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ================= LOGIN ================= */

async function login() {
  cookies = [];

  const page = await request("GET", `${CONFIG.baseUrl}/login`);

  const match = page.match(/What is (\d+) \+ (\d+)/i);
  const ans = match ? Number(match[1]) + Number(match[2]) : 10;

  const form = querystring.stringify({
    username: CONFIG.username,
    password: CONFIG.password,
    capt: ans
  });

  await request(
    "POST",
    `${CONFIG.baseUrl}/signin`,
    form,
    { Referer: `${CONFIG.baseUrl}/login` }
  );
}

/* ================= CLEAN NUMBERS ================= */

function fixNumbers(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => [
    row[1],
    "",
    row[3],
    "Weekly",
    (row[4] || "").replace(/<[^>]+>/g, "").trim(),
    (row[7] || "").replace(/<[^>]+>/g, "").trim()
  ]);

  return data;
}

/* ================= FIX SMS ================= */

function fixSMS(data) {
  if (!data?.aaData) return data;

  data.aaData = data.aaData.map(row => {
    // Pehle null check & fix (jaise pehle tha)
    if (row[4] === null && row.length > 5 && row[5]) {
      row[4] = row[5];
      row.splice(5, 1);  // backup content ko hata diya
    }

    // Ab rearrange: message ko index 5 par, client ko index 6 par
    // Assume kar rahe hain ki message ab index 4 mein hai (after above fix)
    if (row.length >= 8) {  // safe check
      const message = row[4];   // current message (jo fix ke baad yahan hai)
      const client  = row[5];   // current client

      // Naya order banao (baaki columns same rakh ke sirf in dono ko shift)
      // 0-3 same → 4 ko kuch bhi (empty ya remove), 5=message, 6=client, 7+ same
      const newRow = [
        row[0], row[1], row[2], row[3],           // 0-3 same
        null,                                     // index 4 → optional empty (ya remove kar sakte ho)
        message,                                  // index 5 → MESSAGE
        client,                                   // index 6 → CLIENT
        ...row.slice(6)                           // currency, amount, status, etc.
      ];

      return newRow;
    }

    return row;  // agar row chhoti ho to unchanged
  });

  return data;
}

/* ================= FETCH NUMBERS ================= */

async function getNumbers() {
  const url =
    `${CONFIG.baseUrl}/agent/res/data_smsnumbers.php?` +
    `frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1`;

  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/MySMSNumbers`,
    "X-Requested-With": "XMLHttpRequest"
  });

  return fixNumbers(safeJSON(data));
}

/* ================= FETCH SMS ================= */

async function getSMS() {
  const url =
    `${CONFIG.baseUrl}/agent/res/data_smscdr.php?` +
    `fdate1=2026-03-04%2000:00:00&fdate2=2099-12-31%2023:59:59` +
    `&iDisplayLength=2000&iSortCol_0=0&sSortDir_0=desc`;

  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/SMSCDRReports`,
    "X-Requested-With": "XMLHttpRequest"
  });

  return fixSMS(safeJSON(data));
}

/* ================= ROUTE ================= */

router.get("/", async (req, res) => {
  const type = req.query.type;

  if (!type) return res.json({ error: "Use ?type=numbers OR ?type=sms" });

  try {
    await login();

    let result;

    if (type === "numbers") result = await getNumbers();
    else if (type === "sms") result = await getSMS();
    else return res.json({ error: "Invalid type" });

    res.json(result);
  } catch (err) {
    res.json({ error: err.message });
  }
});

module.exports = router;
