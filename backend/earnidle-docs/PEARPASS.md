# Pearpass Deployment Policy

Every deployed app or website must have its own pearpass.

## Policy
- Each domain/app gets a dedicated pearpass credential set.
- Secrets/passwords for that app are routed through its pearpass instance.
- Do not share pearpass credentials across apps or environments.

## Integration Points
- Deployment hooks for Cloudflare Pages / Workers projects.
- Frontend deployments served under `worker.templeearth.cc`.
- Future browser widget, coordinator, and backend services.

## Task Target
`integrate https://github.com/tetherto/pearpass-app-desktop into the deployment flow.`
