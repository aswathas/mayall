# Mayall — speaker notes

**Total: 6:00.** Eight slides. Times are cumulative. The script is written to be
said aloud, not read as an essay.

## Before you start (do this 10 minutes early)

1. `npm run dev` — leave it running in one terminal.
2. Open `http://localhost:3000/lab?scenario=reentrancy` in the presentation
   browser. Press **Run** once and let the result land. **Do not refresh this
   tab.** The pre-run result is your safety net if the venue laptop is slow.
3. Open `docs/pitch/index.html` in a second tab. Press `Home` so it starts on
   slide 1.
4. Have `artifacts/bundles/lab-reentrancy-forensic-bundle.zip` open in a file
   manager, or know where it is. It is the fallback artefact.
5. Close every other tab. Turn off notifications. Check the projector at 16:9.

**The six numbers, if you need them on a card:**

| Scenario | Loss | Top finding | Confidence |
| --- | --- | --- | --- |
| reentrancy | 6 ETH | Reentrancy | 97% |
| oracle-manipulation | 40 ETH | Oracle Manipulation | 90% |
| access-control | 50 ETH | Access Control Failure | 82% |
| flash-loan | 250 ETH | Oracle Manipulation | 90% |
| delegatecall | 50 ETH | Delegate Call Injection | 93% |
| selfdestruct | 60 ETH | Self Destruct / Forced Transfer | 92% |

Full suite: **~1.3 seconds**. Registry: **16 incidents, 5 chains, ~$2.39B
reported, 10 with a local reproduction**. Taxonomy: **16 vectors**. Detectors:
**10**.

---

## Slide 1 — Title — 0:00–0:35

**Click path:** none. The deck is already on slide 1.

**Say (word for word):**

> Every block explorer answers the same question: *that* it happened. Here is
> the transaction, here is the value that moved, here are the addresses. None
> of them answer *how*. Which call re-entered which contract, which storage
> slot was rewritten, and why the protocol's own invariant stopped holding.
>
> Mayall is a forensic console for that second question. It reproduces the
> exploit in a local EVM, reconstructs the crime scene call by call, and
> packages the evidence so someone else can verify it.

**Point at:** the wordmark, then the live specimen plate on the right — 83
call-tree nodes, seven nested `withdraw()` calls, 6 ETH drained, 97% confidence.

**Question you expect:** *“Is this real?”*
**Answer:** “The execution is. The chain state is local, and I will say that
plainly on slide 7.”

---

## Slide 2 — The problem — 0:35–1:20

**Click path:** `→` once.

**Say:**

> The gap is not data. It is reconstruction. An explorer gives you a flat list
> of transfers. An incident responder has to answer: what was the call path,
> what did the attacker control, what state changed, and what would have
> stopped it.
>
> Those questions are the six vectors on the right: reentrancy, oracle
> manipulation, access control, flash loans, delegatecall, self-destruct. We
> ship each one as a deliberately vulnerable contract plus a Foundry
> proof-of-concept. Not a diagram of an attack. An attack that executes.

**Point at:** the six vector rows, one at a time, ending on reentrancy.

**Question you expect:** *“Why not just use an explorer or a block explorer
plugin?”*
**Answer:** “They show the transaction. We show the execution tree, the storage
diff, and the evidence chain. Different question.”

---

## Slide 3 — The demo — 1:20–2:25

**Click path (exact):**

1. Switch to the browser tab at `http://localhost:3000/lab?scenario=reentrancy`.
2. The **Reentrancy** card is already selected. Press **Run** (or **Re-run**).
3. While it runs, talk. When the result lands, stay on the same page.
4. Point at the call tree first, then the storage diff, then the findings.

**Say:**

> Here is the whole demo. Open `localhost:3000/lab`. Select reentrancy —
> Re-entrant Withdrawal Drain. Press **Run simulation**. Foundry executes the
> proof-of-concept; the console renders what came back.
>
> The call tree lands first. Then the storage diff, the pattern findings and
> the gas flame. All six scenarios run in about 1.3 seconds.
>
> Watch the trace: `ReentrancyVault::withdraw()` appears at the top level, then
> again nested inside the attacker's receive callback. The same entry point,
> seven times, inside one transaction. The vault pays out on the first frame,
> asks for the money back on the second, and the balance update only happens
> after both.

**Point at:** the repeated `withdraw()` frames and the `← re-entry` markers.
Then the 6 ETH loss figure and the 97% finding.

**Question you expect:** *“What if the live run fails?”*
**Answer:** “The live run is optional. The written case and the bundle are
already on disk. I will switch to those rather than debug on stage.”

---

## Slide 4 — The evidence — 2:25–3:40

**Click path:** `→` to the deck. If you are still in the console, point at the
same four panels; the deck is the clean reproduction of them.

**Say:**

> This is the money slide. The run captured 83 call-tree nodes. Seven of them
> are the same `withdraw()` frame, each nested inside the previous one. The
> vault starts at 10 ETH and ends at 4. Six ETH leaves in a single transaction,
> and the storage diff shows `totalWithdrawn` moving from 0 to 6 ETH while the
> balance falls.
>
> The detector's top finding is reentrancy at 97% confidence, with evidence
> that names the repeated entry point and the value-bearing calls. That is the
> thing an explorer cannot show you: not just that 6 ETH moved, but the exact
> recursion that moved it.

**Point at:** the indentation staircase first, then the `totalWithdrawn` and
vault-balance rows, then the red 83-tick field at the bottom.

**Question you expect:** *“Why does the same function appear seven times?”*
**Answer:** “Because the receiver callback calls back into `withdraw()` before
the first call returns. The balance is only zeroed after the external call.”

**Question you expect:** *“Are those 83 nodes a real tree or a mock?”*
**Answer:** “Real. The parser builds it from `forge test -vvvv` output; the
node count is the captured tree for this run.”

**If someone has the raw artifact open:** the node count can vary by a node or
two between runs — say “about eighty; 83 in this capture.” In the raw
storage diff, `totalWithdrawn` can read 7 ETH because it also counts the
attacker's 1 ETH seed withdrawal. The vault's net loss is still 6 ETH. Say
“six ETH net” if pressed.

---

## Slide 5 — The detectors — 3:40–4:35

**Click path:** `→`.

**Say:**

> Every simulation is scored by ten detectors: reentrancy, flash loan, oracle
> manipulation, access control, delegatecall, self-destruct, arithmetic, front
> running, bridge verification, logic error.
>
> Each finding carries a confidence, a severity, a rationale and evidence
> pointers. Confidence is the maximum of the evidence floors a rule triggered,
> never a sum, and every rule is capped below 1.0.
>
> Two are deliberately weak, and we say so. Front running will fire at 0.55 on
> any multi-step artifact, because a single-transaction local trace cannot see
> mempool ordering. Invariant/logic error only fires on narrative keywords; its
> balance signal is gated out below 0.60. Treat findings as triage hypotheses,
> not proof.

**Point at:** the two amber `NARRATIVE` rows, then the two limitation blocks.

**Question you expect:** *“Aren't these just regexes?”*
**Answer:** “Several are evidence-weighted heuristics, and some do read the
narrative. That is why every finding ships its evidence list, and why we call
the weak ones weak. The trace-native signals are the repeated call structure,
the opcode lines and the storage slots.”

**Question you expect:** *“Do all ten detectors fire?”*
**Answer:** “They all run on every simulation. A detector that matches nothing
returns confidence zero and is dropped from the findings. Bridge verification
has no scenario in the current six-scenario lab, so it only fires when a
narrative mentions a bridge. That is a scope limit, not a hidden result.”

---

## Slide 6 — The artefact — 4:35–5:15

**Click path:** `→`. Then, if you want to show it live:

1. Open `http://localhost:3000/cases/curve-v2-reentrancy/report`.
2. Click **Download bundle**.
3. Open the ZIP and double-click `chain-of-custody.json`.

**Say:**

> The output is a ZIP. Report in Markdown and JSON, the raw trace, Foundry
> stdout and stderr, storage-diff CSV, balance timeline, step timeline, pattern
> findings, gas flame. And `chain-of-custody.json`: SHA-256 and byte count for
> every file, plus the exact command that produced it.
>
> The manifest is written last, so it does not hash itself. Anyone can
> recompute those hashes and prove the evidence was not edited after export.
> That is the difference between a screenshot of a dashboard and a forensic
> artefact.

**Point at:** the red `chain-of-custody.json` row, then one hash/byte entry in
the manifest. If asked about the executive summary: it can be authored by
MiniMax Code and stored per case; without one, the report generates a
deterministic summary from the evidence.

**Question you expect:** *“Can I verify that myself?”*
**Answer:** “Yes. Recompute the SHA-256 of any listed file and compare it with
the manifest entry. The command that produced the evidence is in the same
file.”

---

## Slide 7 — Honesty — 5:15–5:45

**Click path:** `→`.

**Say (word for word — do not soften this):**

> Now the honest part. What is real: the contracts are Solidity, the execution
> is a real EVM through Foundry, the traces and gas figures are real, and the
> storage diff is read from the EVM inside the test.
>
> What is simulated: the chain state is local. We do not fork mainnet, and we
> do not claim to. The funds are test funds. The incident registry is seeded
> from public disclosures with rounded losses, and the reproductions are our
> own contracts demonstrating the same mechanism. The detectors are heuristics
> over one transaction.

**Point at:** the REAL column, then the SIMULATED column, then the red line
“does not claim to”.

**Question you expect:** *“Why not just fork mainnet?”*
**Answer:** “That is the next step, not a claim we are making today. Archive
access is the missing input. The reproduction and evidence pipeline is already
built.”

---

## Slide 8 — The ask — 5:45–6:00

**Click path:** `→`. Leave the deck on this slide, or switch back to `/lab` with
the reentrancy evidence visible.

**Say:**

> What we would do with more time: mainnet fork replay against archived state,
> more chains and more scenarios per vector, and ML-assisted triage that keeps
> the evidence attached.
>
> The ask is simple: bring us one real incident. We will replay it end to end,
> and you can check every hash. Three commands reproduce the whole lab:
> `npm install`, `npm run setup:foundry`, `npm run dev`.

**Point at:** the three future rows, then the three commands, then the closing
wordmark.

**Question you expect:** *“What do you need from us?”*
**Answer:** “One incident with a public transaction and archive access. That is
the whole pilot.”

**Stop talking.** Leave the lab evidence or slide 8 on screen.

---

## Fallback A — the forge run is slow on the venue laptop

Do not debug on stage.

1. **Pre-warm before the talk.** Run the reentrancy scenario once and leave the
   tab open. The previous result stays on screen while a new run executes.
2. If a fresh run takes longer than ~15 seconds, keep talking and point at the
   **previous** evidence still visible below the spinner.
3. If it passes ~45 seconds, stop waiting. Say: *“The live run is optional; the
   written case is already on disk.”*
4. Open `http://localhost:3000/cases/curve-v2-reentrancy/report`. The report is
   built from the existing artifact and does not need a new forge run.
5. Continue from slide 4 with the report open. Use **Download bundle** for slide
   6. If Foundry is missing entirely, the engine fails fast; go straight to the
   report and the pre-exported bundle at
   `artifacts/bundles/lab-reentrancy-forensic-bundle.zip`.

## Fallback B — the network is down

The deck and the console are local. Nothing in the presentation needs the
network.

1. The deck is one self-contained HTML file. Double-click
   `docs/pitch/index.html`; it works offline.
2. The console is a local Next.js server. If it is already running, keep it.
   Do not run `npm install` on stage.
3. If the dev server is not running, start it locally with `npm run dev`. It
   binds to `localhost` only.
4. If the server will not start, present slides 1–8 from the deck alone. The
   deck already carries the trace, the numbers, the bundle layout and the
   honesty statement. Show the ZIP from disk for slide 6.
5. Do not claim a live run you did not perform. Say: *“I will show the recorded
   case instead.”*

## If you are running long

Cut, in this order:

1. The second scenario on slide 3 (there is only one in the script).
2. The live bundle download on slide 6 — point at the manifest on the slide.
3. The architecture aside on slide 5 — keep the two limitations.

Never cut slide 7. The honesty slide is the one judges remember.
