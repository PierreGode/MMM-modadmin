# MMM-ModAdmin

A MagicMirror² module that exposes a web-based admin interface for managing other modules. It renders nothing on the mirror itself; instead it hosts a small web application where you can inspect installed modules and edit their configuration from a browser.

The project follows the structure and style of [MMM-Chores](https://github.com/PierreGode/MMM-Chores).

## Installation

1. Clone this repository into your `MagicMirror/modules` folder.
2. Add the module to your `config.js`:

```js
{
  module: "MMM-ModAdmin",
  config: {
    adminPort: 8081
  }
}
```

3. Start MagicMirror and open `http://<mirror-ip>:8081` in a browser to access the admin portal.

From the portal you can:
- See all modules installed in the `modules` directory
- View and edit configuration for each module
- Add new configuration options by editing the JSON for a module

Changes are written back to `config/config.js`.
