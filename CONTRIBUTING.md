# Contributing

Use Node 24. Run `npm ci` and `npm run check` before opening a pull request. If you change runtime code, regenerate the committed bundle with `npm run build` and include `dist/index.js` and `dist/licenses.txt`.

Keep the Action additive: do not introduce label removal, replacement, or creation. Never check out or execute pull request code in the consumer workflow. Add deterministic tests for policy, privacy, and maintainer-removal behavior. Live Decisions evaluation is optional and requires maintainer-provided credentials; do not put keys in test fixtures or logs.
