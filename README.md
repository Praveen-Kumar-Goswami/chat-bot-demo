# Qwen Chat Frontend

A dependency-free chat frontend built with HTML, CSS, and vanilla JavaScript.

Serve it locally instead of opening `index.html` directly:

```powershell
cd D:\test\front-end
py -m http.server 5500
```

Then visit `http://localhost:5500`.

The API URL is configured near the top of `app.js`. Chat history and theme
preference are stored only in the browser's local storage.
