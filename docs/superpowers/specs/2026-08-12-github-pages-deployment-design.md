# GitHub Pages deployment design

## Goal

Publish the existing, independently reviewed `main` history as the public repository `TheLogarhythm/paper-morning-pass` and serve its Astro static site at `https://thelogarhythm.github.io/paper-morning-pass/`.

## Repository boundary

- Create one public GitHub repository owned by `TheLogarhythm`.
- Push the existing local `main` branch without rewriting its history.
- Add `origin` as the only local remote and set `main` to track `origin/main`.
- Do not publish the private parent repository, local coordination files, environment files, dependencies, build output, or test artifacts.

## Deployment architecture

Use GitHub Pages with GitHub Actions as its build source. A workflow in `.github/workflows/deploy-pages.yml` will run on pushes to `main` and by manual dispatch.

The workflow will:

1. Check out the committed source.
2. Install the locked npm dependency graph with `npm ci` on the repository's supported Node version.
3. run `npm run check`, `npm test`, and `npm run build`;
4. upload only the generated `dist/` directory as the Pages artifact;
5. deploy that artifact to the protected `github-pages` environment.

The job will receive only the minimum required permissions: read access to repository contents, write access to Pages, and an OpenID Connect token for deployment. It will not use repository secrets. A Pages concurrency group will prevent overlapping deployments while allowing an active deployment to finish.

## URL behavior

The existing Astro configuration is authoritative:

- site origin: `https://thelogarhythm.github.io`
- base path: `/paper-morning-pass`

The deployed HTML, canonical links, navigation, scripts, and favicons must retain that base path. The workflow must not modify content data or personal reading state.

## Failure behavior

Validation, type checking, unit tests, or the production build failing will stop deployment. GitHub will retain the failed workflow logs; the previously deployed Pages version remains available. Repository creation or Pages configuration failures will be reported without force-pushing, deleting, or rewriting local history.

## Acceptance criteria

- `TheLogarhythm/paper-morning-pass` is public and its default branch is `main`.
- Local `main` and `origin/main` point to the same commit after publication.
- Pages reports the workflow build type and a successful deployment.
- `https://thelogarhythm.github.io/paper-morning-pass/` responds successfully and renders Paper Morning Pass with base-aware assets and navigation.
- The local repository is clean and no forbidden private or generated path is tracked.
