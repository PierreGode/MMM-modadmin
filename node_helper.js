const NodeHelper = require("node_helper");
const express = require("express");
const bodyParser = require("body-parser");
const Log = require("logger");
const fs = require("fs");
const path = require("path");
const { exec, execFile } = require("child_process");
const serialize = require("serialize-javascript");

module.exports = NodeHelper.create({
  start() {
    this.configData = {};
    this.configEnvelope = null;
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
      const modPath = path.resolve(this.modulesDir, name);
      if (!modPath.startsWith(this.modulesDir)) {
        return res.status(400).json({ error: "Invalid module name" });
      }
      execFile("git", ["-C", modPath, "pull"], (err, stdout) => {
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
      let content;
      try {
        content = this.formatConfigForWrite(this.configData);
      } catch (err) {
        Log.error("MMM-ModAdmin: failed to serialise config", err);
        return res.status(500).json({ error: "Unable to serialise configuration" });
      }
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
      execFile("git", ["-C", modPath, "fetch"], err => {
        if (err) return resolve({ name, hasUpdate: false });
        execFile("git", ["-C", modPath, "status", "-uno"], (err2, stdout) => {
          if (err2) return resolve({ name, hasUpdate: false });
          const hasUpdate = stdout.includes("behind");
          resolve({ name, hasUpdate });
        });
      });
    });
  },

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|\[\]\\]/g, "\\$&");
  },

  toggleModule(name) {
    try {
      const content = fs.readFileSync(this.configPath, "utf8");
      this.configEnvelope = this.extractEnvelope(content);
      const escaped = this.escapeRegex(name);
      const disabledRegex = new RegExp(`\/\*\s*({\s*module:\s*['"]${escaped}['"][\s\S]*?}\s*,?\s*)\*\/`, "m");
      if (disabledRegex.test(content)) {
        const newContent = content.replace(disabledRegex, "$1");
        fs.writeFileSync(this.configPath, newContent);
        this.readConfig();
        return true;
      }
      const activeRegex = new RegExp(`({\s*module:\s*['"]${escaped}['"][\s\S]*?}\s*,?\s*)`, "m");
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
      const raw = fs.readFileSync(this.configPath, "utf8");
      this.configEnvelope = this.extractEnvelope(raw);
      delete require.cache[require.resolve(this.configPath)];
      this.configData = require(this.configPath);
    } catch (err) {
      Log.error("MMM-ModAdmin: could not load config.js", err);
      this.configData = {};
    }
  },

  formatConfigForWrite(data) {
    const serialized = serialize(data, { space: 2, unsafe: true });
    const envelope = this.configEnvelope || this.defaultEnvelope();
    return `${envelope.prefix}${serialized}${envelope.suffix}`;
  },

  defaultEnvelope() {
    return {
      prefix: "let config = ",
      suffix:
        ";\n\nif (typeof module !== \"undefined\") {\n  module.exports = config;\n}\n"
    };
  },

  extractEnvelope(content) {
    const assignmentRegex = /(var|let|const)\s+config\s*=\s*/;
    const assignmentMatch = assignmentRegex.exec(content);
    if (!assignmentMatch) {
      return null;
    }
    const assignmentIndex = assignmentMatch.index;
    const afterAssignmentIndex = assignmentIndex + assignmentMatch[0].length;
    const objectStart = content.indexOf("{", afterAssignmentIndex);
    if (objectStart === -1) {
      return null;
    }
    const objectEnd = this.findMatchingBrace(content, objectStart);
    if (objectEnd === -1) {
      return null;
    }
    return {
      prefix: content.slice(0, objectStart),
      suffix: content.slice(objectEnd + 1)
    };
  },

  findMatchingBrace(source, startIndex) {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inRegex = false;
    let inRegexCharClass = false;
    for (let i = startIndex; i < source.length; i += 1) {
      const char = source[i];
      const next = source[i + 1];
      if (inRegex) {
        if (char === "[" && !inRegexCharClass && !this.isEscaped(source, i)) {
          inRegexCharClass = true;
          continue;
        }
        if (char === "]" && inRegexCharClass && !this.isEscaped(source, i)) {
          inRegexCharClass = false;
          continue;
        }
        if (char === "/" && !inRegexCharClass && !this.isEscaped(source, i)) {
          inRegex = false;
        }
        continue;
      }
      if (inLineComment) {
        if (char === "\n") {
          inLineComment = false;
        }
        continue;
      }
      if (inBlockComment) {
        if (char === "*" && next === "/") {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }
      if (inSingle) {
        if (char === "'" && !this.isEscaped(source, i)) {
          inSingle = false;
        }
        continue;
      }
      if (inDouble) {
        if (char === '"' && !this.isEscaped(source, i)) {
          inDouble = false;
        }
        continue;
      }
      if (inTemplate) {
        if (char === "`" && !this.isEscaped(source, i)) {
          inTemplate = false;
        }
        continue;
      }
      if (char === "'" && !this.isEscaped(source, i)) {
        inSingle = true;
        continue;
      }
      if (char === '"' && !this.isEscaped(source, i)) {
        inDouble = true;
        continue;
      }
      if (char === "`" && !this.isEscaped(source, i)) {
        inTemplate = true;
        continue;
      }
      if (char === "/" && next === "/") {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (char === "/" && !this.isEscaped(source, i)) {
        const prev = this.getPreviousNonWhitespace(source, i - 1);
        const canStartRegex =
          prev === null || /[({[=:+!?,;*&|^~<>%-]/.test(prev) || prev === "\n";
        if (canStartRegex) {
          inRegex = true;
          continue;
        }
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  },

  isEscaped(source, index) {
    let backslashes = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (source[i] === "\\") {
        backslashes += 1;
      } else {
        break;
      }
    }
    return backslashes % 2 === 1;
  },

  getPreviousNonWhitespace(source, index) {
    for (let i = index; i >= 0; i -= 1) {
      const char = source[i];
      if (!/\s/.test(char)) {
        return char;
      }
    }
    return null;
  }
});
