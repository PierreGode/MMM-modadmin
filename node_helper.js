const NodeHelper = require("node_helper");
const express = require("express");
const bodyParser = require("body-parser");
const Log = require("logger");
const fs = require("fs");
const path = require("path");

module.exports = NodeHelper.create({
  start() {
    this.configData = {};
    this.configPath = path.resolve(__dirname, "..", "..", "config", "config.js");
    this.modulesDir = path.resolve(__dirname, "..");
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.setupServer(payload);
    }
  },

  setupServer(config) {
    const port = config.adminPort || 8081;
    const app = express();
    app.use(bodyParser.json());
    app.use(express.static(path.join(__dirname, "public")));

    this.readConfig();

    app.get("/api/modules", (req, res) => {
      fs.readdir(this.modulesDir, { withFileTypes: true }, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        const mods = files.filter(f => f.isDirectory()).map(f => f.name);
        res.json(mods);
      });
    });

    app.get("/api/config", (req, res) => {
      res.json(this.configData);
    });

    app.put("/api/config", (req, res) => {
      this.configData = req.body;
      const content = "module.exports = " + JSON.stringify(this.configData, null, 2) + ";\n";
      fs.writeFile(this.configPath, content, err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });

    app.listen(port, () => {
      Log.log(`MMM-ModAdmin server listening on port ${port}`);
    });
  },

  readConfig() {
    try {
      delete require.cache[require.resolve(this.configPath)];
      this.configData = require(this.configPath);
    } catch (err) {
      Log.error("MMM-ModAdmin: could not load config.js", err);
      this.configData = {};
    }
  }
});
