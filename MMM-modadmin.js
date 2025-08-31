Module.register("MMM-ModAdmin", {
  defaults: {
    adminPort: 8081
  },

  start() {
    this.sendSocketNotification("INIT", this.config);
  },

  getDom() {
    // This module intentionally renders nothing on the mirror
    return document.createElement("div");
  }
});
