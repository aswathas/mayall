# Mayall

**A forensic console for Web3 exploits.** Reproduce the attack in a real local
EVM, reconstruct the crime scene call by call, and export evidence anyone can
verify.

> Block explorers show you **that** an exploit happened. Mayall shows you
> **how** — the call tree, the storage writes, the balance movement, and the
> evidence chain attached.

## What it does

Mayall wraps the Foundry CLI. It runs a Solidity proof-of-concept against a
deliberately vulnerable contract, captures the full call tree and storage
mutations, scores the mechanism with ten pattern detectors, and packages the
result as a forensic report and a hash-manifested ZIP.

Six attack scenarios ship as live local reproductions: **reentrancy, oracle
manipulation, access control, flash loan, delegatecall, self-destruct**. Each is
a vulnerable contract plus a Foundry PoC.

## The proof it is real

| Scenario | Loss | Top finding | Confidence |
| --- | --- | --- | --- |
| reentrancy | 6 ETH | Reentrancy | 97% |
| oracle-manipulation | 40 ETH | Oracle Manipulation | 90% |
| access-control | 50 ETH | Access Control Failure | 82% |
| flash-loan | 250 ETH | Oracle Manipulation | 90% |
| delegatecall | 50 ETH | Delegate Call Injection | 93% |
| selfdestruct | 60 ETH | Self Destruct / Forced Transfer | 92% |

All six run in **~1.3 seconds**. The reentrancy run captures an **83-node call
tree**, with the same `withdraw()` function invoked **7 times nested** in one
transaction, draining **6 ETH**.

The evidence bundle contains the report (Markdown + JSON), the raw trace,
Foundry stdout/stderr, storage-diff CSV, balance-timeline CSV, timeline CSV,
pattern findings, gas flame, and `chain-of-custody.json` — SHA-256 and byte
count for every file, plus the exact command that produced it.

The report's executive summary can be authored by **MiniMax Code** and stored
per case; without one, a deterministic summary is generated from the evidence.

## The registry

**16** publicly reported incidents across **5** chains, **~$2.39B** in reported
losses. **10 of 16** have a local reproduction. **16** attack vectors are
modelled; **10** detectors run on every simulation.

## Run it

```bash
npm install
npm run setup:foundry
npm run dev
```

Open **http://localhost:3000/lab**, select `reentrancy`, press **Run**.

## The honest limitation

The chain state is **local**. Mayall does **not** fork mainnet and does not claim
to. The contracts, the EVM execution, the traces, the gas figures and the
storage diffs are real; the funds are test funds in a local simulation. The
incident registry is seeded from public disclosures with rounded losses, and the
reproductions are our own contracts demonstrating the same mechanism.

Detectors are heuristics over one transaction. They do not read bytecode and
cannot see mempool ordering. Confidence is a triage score, and every finding
ships its evidence so you can disagree with it.

**The next step:** mainnet fork replay against archived state, more chains and
more scenarios per vector, and ML-assisted triage with the evidence attached.
Bring us one real incident.
