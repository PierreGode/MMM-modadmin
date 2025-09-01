const NodeHelper = require("node_helper");
const express = require("express");
const bodyParser = require("body-parser");
const Log = require("logger");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

module.exports = NodeHelper.create({
  start() {
    this.configData = {};
    const candidates = [
      path.resolve(__dirname, "..", "..", "config", "config.js"),
      path.resolve(__dirname, "..", "..", "..", "config", "config.js"),
      path.resolve(process.cwd(), "config", "config.js")
    ];
    this.configPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
    this.modulesDir = path.resolve(__dirname, "..");
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.setupServer(payload);
    }
  },

  setupServer(config) {
    const port = config.adminPort || 5007;
    const app = express();
    app.use(bodyParser.json());
    app.use(express.static(path.join(__dirname, "public")));

    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "admin.html"));
    });

    this.readConfig();

    app.get("/api/modules", async (req, res) => {
      fs.readdir(this.modulesDir, { withFileTypes: true }, async (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        const mods = files.filter(f => f.isDirectory()).map(f => f.name);
        const detailed = await Promise.all(mods.map(name => this.checkModuleUpdate(name)));
        res.json(detailed);
      });
    });

    app.post("/api/modules/:name/update", (req, res) => {
      const name = req.params.name;
      const modPath = path.join(this.modulesDir, name);
      exec(`git -C "${modPath}" pull`, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: err.message });
        // Try to restart MagicMirror. This may fail silently if not using pm2.
        exec("pm2 restart mm || pm2 restart MagicMirror", () => {});
        res.json({ success: true, output: stdout });
      });
    });

    app.post("/api/modules/:name/toggle", (req, res) => {
      const name = req.params.name;
      const result = this.toggleModule(name);
      if (result === null) {
        return res.status(404).json({ error: "Module not found" });
      }
      exec("pm2 restart mm || pm2 restart MagicMirror", () => {});
      res.json({ success: true, enabled: result });
    });

    app.get("/api/config", (req, res) => {
      res.json(this.configData);
    });

    app.put("/api/config", (req, res) => {
      this.configData = req.body;
      const json = JSON.stringify(this.configData, null, 2);
      const content = `let config = ${json};\nif (typeof module !== "undefined") {\n  module.exports = config;\n}\n`;
      this.backupConfig();
      fs.writeFile(this.configPath, content, err => {
        if (err) return res.status(500).json({ error: err.message });
        this.readConfig();
        res.json({ success: true });
      });
    });

    app.listen(port, "0.0.0.0", () => {
      Log.log(`MMM-ModAdmin server listening on port ${port}`);
    });
  },

  checkModuleUpdate(name) {
    return new Promise(resolve => {
      const modPath = path.join(this.modulesDir, name);
      if (!fs.existsSync(path.join(modPath, ".git"))) {
        return resolve({ name, hasUpdate: false });
      }
      exec(`git -C "${modPath}" fetch`, err => {
        if (err) return resolve({ name, hasUpdate: false });
        exec(`git -C "${modPath}" status -uno`, (err2, stdout) => {
          if (err2) return resolve({ name, hasUpdate: false });
          const hasUpdate = stdout.includes("behind");
          resolve({ name, hasUpdate });
        });
      });
    });
  },

  toggleModule(name) {
    try {
      const content = fs.readFileSync(this.configPath, "utf8");
      const disabledRegex = new RegExp(`\/\*\s*({\s*module:\s*['"]${name}['"][\s\S]*?}\s*,?\s*)\*\/`, 'm');
      if (disabledRegex.test(content)) {
        const newContent = content.replace(disabledRegex, '$1');
        fs.writeFileSync(this.configPath, newContent);
        this.readConfig();
        return true;
      }
      const activeRegex = new RegExp(`({\s*module:\s*['"]${name}['"][\s\S]*?}\s*,?\s*)`, 'm');
      if (activeRegex.test(content)) {
        const newContent = content.replace(activeRegex, '/*$1*/\n');
        fs.writeFileSync(this.configPath, newContent);
        this.readConfig();
        return false;
      }
    } catch (err) {
      Log.error("MMM-ModAdmin: could not toggle module", err);
    }
    return null;
  },

  backupConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const dir = path.dirname(this.configPath);
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const backup = path.join(dir, `config.js.bak-${ts}`);
        fs.copyFileSync(this.configPath, backup);
        const backups = fs.readdirSync(dir)
          .filter(f => f.startsWith("config.js.bak-"))
          .map(f => ({
            name: f,
            time: fs.statSync(path.join(dir, f)).mtime.getTime()
          }))
          .sort((a, b) => b.time - a.time);
        backups.slice(3).forEach(b => {
          fs.unlinkSync(path.join(dir, b.name));
        });
      }
    } catch (err) {
      Log.error("MMM-ModAdmin: could not create config backup", err);
    }
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
