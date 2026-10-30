# Credible, bounded client-pilot plan

This is a **hypothetical proposal**, not an account of completed research, observed savings, market demand, or validated pricing.

## Five targeted discovery questions

1. Which precise source pages, attachments, and publication channels currently create the highest-risk missed updates? Can the team provide five to ten historical cases with known ground truth?
2. What is the current manual procedure for detecting, distinguishing, interpreting, and assigning a change, and what evidence must be preserved for audit?
3. How does the team distinguish authoritative effective dates from posting dates, unconfirmed OCR text, and ambiguous bulletin language?
4. Who has authority to call a change consequential, assign a program owner, acknowledge a task, and approve resolution?
5. What are the acceptable operating bounds for retrieval failures, non-substantive alerts, sensitive source content, retention, and security before any real-source trial?

## Baseline task measurement

Before a pilot, select an annotated set of ~20 historical bulletin/attachment episodes, including known substantive, editorial, missing, moved, unchanged and inaccessible cases. Have two analysts independently inspect their normal existing channels, with start/finish times. Record detection recall on known meaningful changes, total false-positive review items, review time per item, missed evidence, uncertain-date errors, and days with incomplete coverage. Resolve label disagreements to a human ground-truth set. Avoid deriving baseline from synthetic fixtures alone.

## Shadow-mode trial

Proposed **two weeks**, after written source permission/security review. A human continues the usual monitoring and remains authoritative. The demo-derived system runs in parallel, limited to preapproved public sources and bounded captures, with no staff instructions or messages sent. Analysts annotate the provenance and disposition of each difference, including OCR/uncertain-dates and fetch failures. Keep manual workflow as fallback. Do not automatically treat the automated output as authoritative.

## Suggested success measures (targets to negotiate, not achieved claims)

- Recall **≥95% of adjudicated material changes** in the small reference set (report numerator/denominator and confidence limitations).
- Zero silent missing-source failures: every intentionally induced retrieval failure yields a visible coverage gap.
- No automatic operational actions or confirmed effective dates from model/extracted text.
- Median review time at least **25% lower** than measured baseline without lower adjudicated accuracy.
- Review burden ≤2 false-positive substantive suggestions per source/week, unless the customer sets a different threshold.
- 100% of action assignments record an authorized human disposition and evidence link.

## Failure / stop criteria

Pause real-source use if any critical numeric change is silently missed, a missing source is represented as unchanged, source text drives an unreviewed instruction, retrieval crosses an approved security boundary, original evidence is lost, an unauthorized actor can change actions, or an operator cannot reproduce a material diff. A serious OCR/date false interpretation also blocks expansion until reviewed and corrected.

## Next scope decision

If measured criteria are met, consider a **one-program, read-only monitored-source trial** with security-reviewed fetchers, robust PDF/OCR validation, identities/roles, retention rules, and production observability. If not, keep the tool in analyst-assisted comparison mode and focus on the failure category with the highest operational consequence. Buyer, willingness to pay, product-market fit, and time savings remain hypotheses pending customer validation.
