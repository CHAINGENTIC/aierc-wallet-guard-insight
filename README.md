# AIERC Wallet Guard — Insight (MetaMask Snap)

A MetaMask Snap that shows the AIERC determination on the MetaMask confirmation
screen, before you sign.

For a transaction or a token permit, the panel shows:

- **the operation** — what the transaction actually does, in plain words;
- **the counterparty's record** — a tally of prior determinations on that
  address (clean, flagged, settled deals), never a score;
- **the determination** — CLEAN or FLAGGED, with the facts behind a FLAGGED
  result.

The person reads it and decides. The Snap never signs, never holds keys and
never creates accounts.

> **Status:** v0.1.0. Built and passing the MetaMask Snaps build check. It has
> not had its final audit yet.

## Permissions

| Permission | Why |
|---|---|
| `endowment:transaction-insight` | show the panel on transaction confirmations |
| `endowment:signature-insight` | show the panel on signature requests (token permits) |
| `endowment:network-access` | ask the AIERC service for the determination and the record |

No keyring, account, entropy, dialog or state permissions.

## What the screen says

- **Service not reachable:** "not examined", with the plain facts of the
  transaction. It never claims safety when nothing was examined.
- **CLEAN:** the operation, the recipient and its record, and the statement that
  the operation, the recipient and the call data were examined and nothing was
  found.
- **FLAGGED:** the operation, the explanation, each fact found, and the
  recipient's record. Shown with `critical` severity.
- **Token permits** (Permit, Permit2, PermitSingle, PermitBatch) are treated as
  approvals: the spender's record is shown with the determination.

## Services it calls

- Determination: `POST https://wallet.aierc.tech/snap/evaluate`
  → `{ level, facts, explanation, operationDescription, reasoningHash }`
- Counterparty record: `GET https://determine.aierc.tech/v1/counterparty?address=&chainId=`
  → `{ known, clean, flagged, settlements, blacklisted, statement }`

Both run in parallel with an 8-second timeout. A failed call shows "not
examined" or "record not reachable"; it never falls back to CLEAN.

## Build and run

```
npm install
npm run build    # writes dist/bundle.js and updates the manifest shasum
npm run serve    # http://localhost:8081
```

Install in MetaMask Flask from `local:http://localhost:8081`, open any dApp and
start a transfer: the AIERC panel appears on the confirmation screen.

## Licence

Business Source License 1.1. See `LICENSE`.

Eternal Digital Assets Corp. Patent pending: CIPO 3304029, WIPO PCT/IB2026/052205.
