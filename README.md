# QVAC Contribution Layer

A contribution and rewards layer for apps that already use decentralized inference.

## What this is

This project adds an opt-in contribution and rewards surface on top of apps that already route or execute inference through decentralized networks. It does not replace Cortensor, Fortytwo, or any existing inference backend. Instead, it provides publisher verification, embed token issuance, contributor consent, session tracking, attribution, and payout control.

## What this is not

This is not a deployment platform, model router, inference scheduler, or replacement backend. It does not broker or reroute inference traffic. The responsibility for serving or coordinating inference remains with the existing decentralized inference systems.

## How it fits

A decentralized inference app adds an embedded widget, users opt into approved browser-side contribution, sessions are metered and attributed, and rewards flow to both the participant and the publisher. This project provides the control plane for that flow.

## Use cases

- Publisher registration and placement verification.
- Contributor identity and consent management.
- Contribution session lifecycle and status tracking.
- Usage-linked attribution and reward accrual.
- On-chain settlement to contributor and publisher wallets.

## Use cases this does not cover

- Infrastructure deployment or app hosting.
- Manual inference scheduling or job marketplaces.
- Model routing, translation, or inference replacement flows.

## Name

Backend service: `cortensor-rewards`  
Public product: QVAC Contribution Layer / Rooted
