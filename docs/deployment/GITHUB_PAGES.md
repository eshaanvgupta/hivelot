# GitHub Pages

The public frontend is published at https://eshaanvgupta.github.io/hivelot/.
The `Publish GitHub Pages` workflow packages `apps/web/public` and deploys it on
pushes to `master` or `main`. Repository Settings > Pages must use GitHub Actions.

Build the exact static artifact locally:

```sh
node scripts/build-pages.js
```

Serve `apps/web/dist` with a static HTTP server to inspect the published version.
The package contains frontend assets only. Its preview notice identifies example
figures and visualizations, and backend operations are unavailable. It does not
submit settlement transactions or import visitor private keys.

GitHub Pages cannot run the Express API, persistent database, or event workers.
For the existing local server experience, run `npm install` followed by `npm run
dev:api` from the repository root and open http://localhost:4000. A live commerce
deployment requires separate backend hosting, verified deployed contracts, and
frontend integration with those services.

Clone the contracts dependency with:

```sh
git submodule update --init --recursive
```
