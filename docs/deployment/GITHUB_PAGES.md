# GitHub Pages entry point

https://eshaanvgupta.github.io/hivelot/ redirects to the full-stack application at
https://hivelot-network.guppy-ai.chatgpt.site/. Pool URL fragments are preserved.

GitHub Actions packages `apps/web/dist` after running `scripts/build-pages.js`.
The destination is declared in `infrastructure/production.json`. The hosted app
source is in `apps/product/`; its API and D1 database execute on Sites rather than
GitHub Pages. A static host cannot execute those services.

For current deployment status and mainnet requirements, read
[RELEASE_STATUS.md](RELEASE_STATUS.md).
