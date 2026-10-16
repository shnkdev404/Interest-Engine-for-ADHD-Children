# SparkPath — Research Review: What to Add

As of 2026-10-16. Four research passes: open-source and hackathon projects, commercial products, academic literature, and AI / recommender / child-safety work. Every source below was opened by the researcher unless marked **[snippet]** (seen only in search results) or **[not opened]**. Effect sizes come from abstracts, not full papers.

**Bottom line:** nobody combines interest-wrapped tasks, a taste graph and fading-interest detection. The best-documented failure in this market is novelty wearing off after 4–8 weeks, and SparkPath is the only product found that measures it. The strongest-evidence addition we're missing is a **teacher-to-parent Daily Report Card**. The biggest technical upgrade is **statistically sound fading detection** (confidence instead of a raw % drop) plus an **evaluation harness** that proves the Qloo difference with numbers.

---

## Status (2026-10-16): Tier 1 built

| # | Addition | Built as | Measured |
| --- | --- | --- | --- |
| 1 | Fading detection v2 | `lib/engagement/score.ts` + `stats.ts`: 8-week horizon, break weeks, CUSUM + Beta-Binomial, both-recent-weeks guard, confidence, Theil–Sen trend; Rest → dormant → probe → active | Simulation (`lib/eval`): F1 **0.52 → 0.91**; one bad week flagged 100% → 11%; marked break 100% → 0%; recall 83%/61% → 91%/85% |
| 2 | Daily school–home card | `lib/drc.ts`, `components/daily-card.tsx`; parent (This week) and teacher (class → Daily cards); memory note once per completed day; planner sees results | Tests: seeded week, reward earned, one memory note, wording lint |
| 3 | Evaluation harness | `npm run eval` → `reports/eval-*.md` | Live Qloo, offline planner: 6/6 valid plans, 0 wording hits; caught two live-API bugs (below) |
| 4 | Deep, not surface | Planner prompt rule; judge criterion "deepInterest" in the eval | Judge needs ANTHROPIC_API_KEY |
| 5 | Choice of two | `alt` on missions; child picks; `variant` logged and sent to memory | — |
| 6 | Immediate rewards | `rewards` in the plan (Qloo items where possible); picker after Done; choice to memory; no deductions | — |
| 7 | Movement break | `subject: "break"` mission required in every plan | — |

Found while building: the live API returns an entity's real type in `subtype` (type is just `urn:entity`), the video game type is `urn:entity:videogame`, and kid relevance needs `filter.tags` (D-10). Fixed and tested.

## 1. Ranked additions

Effort assumes the current codebase. "Evidence" uses: **strong** (meta-analyses / RCTs), **moderate**, **emerging** (indirect or early), **practice** (common in products, little research).

### Tier 1 — add before submission (~6–7 days total)

| # | Addition | Why (evidence / source) | Evidence | Effort |
| --- | --- | --- | --- | --- |
| 1 | **Fading detection v2:** Beta-Binomial confidence + one-sided CUSUM, pause-aware (holiday/sick days excluded), and a **dormant → resurface** state instead of "dead" | Single-week % drops are noisy with 3–8 data points. Boredom research shows interest *recovers* after a break (Kapoor et al., WSDM 2015). Holidays otherwise look like fading (pause days in open-source reward apps). Novelty wears off within weeks (Tsay 2019; Joon reviews) | Emerging | 1–1.5 d |
| 2 | **Daily school–home card** (Daily Report Card): teacher sets 2–4 daily targets per child, ticks yes/no per period; parent sees it next to missions; a home reward is linked | DRC meta-analysis: teacher-rated g = 0.36, observed g = 1.05 (Iznardo 2020). RCT n = 213: fewer rule violations (Fabiano 2025). Homework training + DRC: large effects on completion (Merrill 2017). No open-source DRC tool was found | **Strong** | 2 d |
| 3 | **Evaluation harness** (`npm run eval`): 20 synthetic children × {SparkPath, AI alone}; grounding %, invented-title %, age-fit violations, lint hits, judge rubric; fading-detector precision/recall on simulated trajectories | Judges score "technological implementation". Numbers beat claims. FActScore-style claim checking (Min et al., EMNLP 2023); LLM-judge bias controls (survey arXiv 2411.15594 [snippet]) | Method | 2 d |
| 4 | **"Deep, not surface" missions:** prompt rule plus judge criterion, so a mission uses what the child actually *does* with the interest ("plan a Minecraft build budget"), not just a renamed noun | Interest personalisation improved algebra learning and persisted (Walkington 2013 [snippet]). Deep personalisation beats surface and helps low-interest learners most (Walkington & Bernacki 2018 [snippet]) | Moderate | 0.5 d |
| 5 | **Choice of two:** each mission offers two interest-wrapped versions; the child picks one (logged) | Choice from a task menu raised engagement (Dunlap 1994; Powell & Nelson 1997, single-case) | Moderate | 0.5 d |
| 6 | **Immediate rewards from the taste graph, no penalties:** a small reward the moment a mission is logged, chosen from Qloo picks ("an episode of LEGO Masters", "15 Minecraft minutes"); no point deductions | Children with ADHD prefer immediate reward; high-intensity reinforcement works (Luman 2005; Sonuga-Barke 2002). Response cost lowered motivation on low-interest tasks (Carlson & Tamm 2000). Uses Qloo a second time | **Strong** (principle) | 1 d |
| 7 | **Movement-break mission type** ("10 minutes of active play, then homework") | One 20-minute bout improved attention and maths/reading tasks (Pontifex 2013). Exercise meta-analysis SMD 0.84 for attention, small sample (Cerrillo-Urbina 2015). Movement during tasks predicted *better* working memory (Sarver 2015) | Moderate | 0.5 d |

### Tier 2 — strong polish if time allows (~4–5 days)

| # | Addition | Why | Evidence | Effort |
| --- | --- | --- | --- | --- |
| 8 | **Printable / TV mission board** with a QR code back to logging, plus a reading toggle (bionic text via `text-vide`, MIT; OpenDyslexic, OFL) | The child sees missions without using AI or a screen app. EFingPlanner printables and the Daddy Daycare TV view are precedents | Practice | 1 d |
| 9 | **Visual timer with estimated vs actual minutes**, shown to the parent | Children with ADHD estimate time less accurately (g > 0.40; Zheng 2022). Timers are table stakes in Tiimo, Brili, Goally | Emerging | 0.5–1 d |
| 10 | **Calm "hard moment" card:** three plain steps shown right after a hard moment is logged; skipped days in neutral grey | Non-punitive design (Ahloom; SPARK robot's protocol). Parent stress is high (Theule 2013) | Practice | 0.5 d |
| 11 | **"Why this?" explainability:** "Fans of Minecraft and cricket also love this; shares tags: building, team" | Showing why recommendations happen helps against filter bubbles (KidRec workshops; BeeTrap IDC 2024 [snippet]) | Practice | 0.5 d |
| 12 | **Child self-check** ("Did I finish? 👍/👎") recorded next to the parent's log | Self-regulation interventions had the largest single-subject effects (Gaastra 2016) | Moderate | 0.5 d |
| 13 | **Praise prompts** for parents ("Name one thing that went well today") | More praise relative to reprimands went with more on-task time (Caldarella 2020, observational; no magic ratio) | Moderate | 0.25 d |
| 14 | **Weekly digest, parent-chosen cadence**, no streaks | Parents reshaped app prompts into praise and planning when given control (CalmReminder, CHI 2026). No streak shaming (UK AADC std 13) | Emerging | 0.5 d |
| 15 | **"Do it together" mission type** (parent and child side by side, shared timer) | Body-doubling tools exist for adults (Dirework); parent co-use is recommended (AAP Media and Young Minds 2016) | Practice | 0.5 d |
| 16 | **Novelty slot:** one discovery pick per week, chosen for diversity (MMR, λ ≈ 0.7), adoption logged | Children's recommenders show mainstream bias (RecSys 2025 reproducibility study [snippet]) | Emerging | 1 d |

### Tier 3 — compliance and trust (~1.5 days, do alongside)

- **Privacy page in plain language**, a published **retention policy** (e.g. notes auto-deleted after 12 months; ClassDojo moved to one year after criticism), **export + delete** per child.
- **Parent-enabled profiling:** engagement scoring explained and switchable (UK AADC std 12; India DPDP §9(3) bars "behavioural monitoring" of children, so frame scoring as parent-entered observations for the child's benefit).
- **No child data to vendors beyond what's needed:** send interests and age band only; pseudonymous child IDs in Hindsight; vendor training opt-out.
- **"If this keeps happening, consider talking to your child's doctor or school"** link when hard moments recur (AAP 2019; CDC).
- **DPIA-style one-pager** in `docs/` and a short written information-security note (COPPA amended rule).

### Not recommended

| Idea | Why not |
| --- | --- |
| A child-facing app or AI chat | FTC 6(b) inquiry into AI companions for minors (2025 [snippet]); multiplies safety and consent work; SparkPath's adult-only stance is a differentiator |
| Eye / webcam attention tracking (WebGazer, ADHD Aid) | Surveillance of children; EU AI Act bans biometric emotion inference in education (Art. 5(1)(f)); GPL licence |
| Streaks, loss aversion, point deductions | AADC std 13, AI Act Art. 5(1)(b); response cost hurt motivation (Carlson & Tamm 2000) |
| Wearables / heart-rate games (Mightier-style) | Hardware, cost, and clinical territory |
| AI story generators | Crowded market (KindyAI, StoryBee, Nookly) and a content-safety burden |
| Scoring Vanderbilt / IRS / rating scales | Diagnostic instruments; Vanderbilt is © AAP/NICHQ; implies clinical use |

---

## 2. Fading detection v2 — the algorithm

Per interest, per week: `assigned` and `done` missions, engaged minutes, negative-note flag. Weeks marked as pause (holiday, sick) are skipped.

1. **Beta-Binomial confidence.** Early window (first 2–3 active weeks) and recent window (last 2 weeks), each with a Beta(1, 1) prior on completion rate. Flag **fading** when P(p_recent < p_early − 0.15) > 0.8. Show it: *"Fading · 82% sure · over 3 weeks."*
2. **One-sided CUSUM on minutes per mission** (normalised to the baseline): Cₜ = max(0, Cₜ₋₁ + (1 − yₜ/B) − δ), δ = 0.1, alarm at h = 0.35. Catches slow declines; one bad week doesn't trigger it.
3. **Rule:** fading = (1 **or** 2) **and** (a completion drop **or** a negative note), the current safety condition kept.
4. **Dormant → resurface.** A faded interest rests 2–3 weeks, then appears once as a probe mission; the result is logged to memory (Kapoor 2015: interest recovers after rest).
5. **Theil–Sen slope** over the last 4–6 points as the plain-language trend line in Insights.

Arjun's seed must still read "dropped 41%" (minutes) while the badge shows the confidence. Test with simulated trajectories: stable, gradual drop, one bad week, holiday gap, recovery; report precision/recall for the old rule vs v2.

---

## 3. Where SparkPath stands

**Genuinely different (nobody found doing this):**
- Interest as the engine of the task, not a reward skin (Joon's pet, Habitica's RPG) or fixed themed content (Bookbot's Minecraft books).
- Cross-domain taste graph (books ↔ shows ↔ games) for children's interests.
- Per-interest engagement tracking and next-interest suggestions; the market's biggest complaint is novelty decay.
- One loop for home and school (per-child lesson hooks feeding the same memory). DRC software doesn't exist in open source.
- Adult-only AI with linted, non-medical wording, plus an offline fallback and a built-in AI-alone comparison.

**Closest prior work:** a CHI 2024 conversational agent for first-graders' daily tasks with parent and teacher dashboards (Park et al. [snippet]); TDAH, an open-source space-mission routine app (single fixed theme, 2021). No peer-reviewed LLM weekly planner for children with ADHD was found; say "we did not find", not "first ever".

**Table stakes we partly lack:** visual timers, routine steps, rewards (Tier 1 #6, Tier 2 #9).

**Pricing benchmarks:** consumer apps $4–16/month (Khanmigo $4, Brili $7.99, Joon $12.99, Tiimo ≈ $12); annual plans ≈ 40–60% of monthly × 12; teacher tools usually free; schools pay ≈ $22–40 per student per year (Lexia) or $210–330 per teacher (BrainPOP). Plausible SparkPath: free for teachers, parents $6–10/month (≈ $60/year), school pilots per student below Lexia.

---

## 4. Wording: claims to avoid

- "Treats", "reduces symptoms", "improves attention", "clinically proven", "therapeutic". EndeavorRx needed FDA authorisation for claims like these, and its approval rested on an attention test while clinician scales showed no significant difference [critique coverage].
- "Interest-based nervous system", "dopamine hacking" as science: popular terms (Dodson) with no peer-reviewed test found.
- "Hyperfocus is a superpower": the construct has no agreed definition (Ashinoff & Abu-Akel 2021).
- A fixed praise ratio ("5:1").
- Research effect sizes presented as SparkPath outcomes. None of these studies tested SparkPath.
- "Replaces parent training, medication, IEP/504 or reading intervention" (AAP 2019; Denton 2020).

Safe framing: *"engagement and learning support"*, *"small, quick wins"*, *"themes get old; here's a fresh one to try"*, *"a daily school-home note so you stay in sync"*.

---

## 5. Sources

**Literature**
- Sonuga-Barke 2002, dual pathway — https://pubmed.ncbi.nlm.nih.gov/11864715/
- Luman, Oosterlaan & Sergeant 2005, reinforcement in ADHD — https://pubmed.ncbi.nlm.nih.gov/15642646/
- Carlson & Tamm 2000, response cost and interest — https://pubmed.ncbi.nlm.nih.gov/10710842/
- Ashinoff & Abu-Akel 2021, hyperfocus — https://pubmed.ncbi.nlm.nih.gov/31541305/
- Daley et al. 2014, behavioural interventions meta-analysis — https://pubmed.ncbi.nlm.nih.gov/25062591/
- Wolraich et al. 2019, AAP guideline — https://pmc.ncbi.nlm.nih.gov/articles/PMC7067282/
- CDC behaviour therapy — https://www.cdc.gov/adhd/treatment/behavior-therapy.html
- Iznardo et al. 2020, DRC meta-analysis — https://pubmed.ncbi.nlm.nih.gov/29135352/
- Owens et al. 2012, DRC — https://pubmed.ncbi.nlm.nih.gov/23046786/
- Fabiano et al. 2025, DRC RCT — https://pubmed.ncbi.nlm.nih.gov/40587316/
- Merrill et al. 2017, homework + DRC — https://pubmed.ncbi.nlm.nih.gov/27618639/
- Dunlap et al. 1994, choice — https://pubmed.ncbi.nlm.nih.gov/7928792/
- Powell & Nelson 1997, choice — https://pubmed.ncbi.nlm.nih.gov/9103995/
- Gaastra et al. 2016, classroom strategies — https://pmc.ncbi.nlm.nih.gov/articles/PMC4757442/
- Zheng et al. 2022, time perception — https://pubmed.ncbi.nlm.nih.gov/33302769/
- Schultz et al. 2025, serious games — https://pubmed.ncbi.nlm.nih.gov/41122750/
- Tsay et al. 2019, gamification novelty — https://onlinelibrary.wiley.com/doi/abs/10.1111/jcal.12385
- Cerrillo-Urbina et al. 2015, exercise — https://pubmed.ncbi.nlm.nih.gov/25988743/
- Pontifex et al. 2013, single bout of exercise — https://pubmed.ncbi.nlm.nih.gov/23084704/
- Sarver et al. 2015, movement and working memory — https://pubmed.ncbi.nlm.nih.gov/25863472/
- Wood et al. 2018, text-to-speech — https://pubmed.ncbi.nlm.nih.gov/28112580/
- Denton et al. 2020, ADHD and reading — https://pubmed.ncbi.nlm.nih.gov/32982141/
- Caldarella et al. 2020, praise ratio — https://doi.org/10.1080/01443410.2020.1711872
- Theule et al. 2013, parenting stress — https://doi.org/10.1177/1063426610387433
- Chacko et al. 2016, parent training dropout — https://pubmed.ncbi.nlm.nih.gov/27311693/
- Li et al. 2023, parenting apps review — https://pmc.ncbi.nlm.nih.gov/articles/PMC10273034/
- Kollins et al. 2020, STARS-ADHD — https://pubmed.ncbi.nlm.nih.gov/33334505/
- Ra et al. 2018, digital media and ADHD symptoms — https://pubmed.ncbi.nlm.nih.gov/30027248/
- Fabiano et al. 2006, Impairment Rating Scale — https://pubmed.ncbi.nlm.nih.gov/16836475/
- Walkington 2013, interest personalisation — https://www.apa.org/pubs/journals/edu/2070505 [snippet]
- Walkington & Bernacki 2018, moderators — https://link.springer.com/article/10.1007/s40593-018-0168-1 [snippet]
- Yadav et al. 2023, GPT-4 interest rewrites — https://arxiv.org/abs/2306.00190

**AI, recommenders, evaluation**
- Park et al., CHI 2024, conversational agent for executive function — https://ir.ymlib.yonsei.ac.kr/handle/22282913/206385 [snippet]
- Exploring LLMs through a neurodivergent lens — https://arxiv.org/abs/2410.06336
- CalmReminder, CHI 2026 — https://arxiv.org/abs/2602.16893
- Kapoor et al. 2015, dynamics of boredom — https://experts.umn.edu/en/publications/just-in-time-recommendations-modeling-the-dynamics-of-boredom-in-
- Adams & MacKay 2007, Bayesian online changepoint detection — https://arxiv.org/abs/0710.3742
- KidRec — https://arxiv.org/abs/2005.12992 [snippet]
- FActScore — https://arxiv.org/abs/2305.14251
- MinorBench — https://arxiv.org/abs/2503.10242 [snippet]

**Regulation**
- COPPA amended rule (compliance from 22 Apr 2026) — https://www.dwt.com/blogs/privacy--security-law-blog/2025/05/coppa-rule-ftc-amended-childrens-privacy
- India DPDP Rules 2025, Rule 10 — https://dpdpa.com/dpdparules/rule10.html (commencement date to verify in the Gazette)
- UK Age Appropriate Design Code — https://ico.org.uk/media/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services-2-1.pdf [snippet]
- EU AI Act Art. 5(1)(f) — https://fpf.org/blog/red-lines-under-eu-ai-act-unpacking-the-prohibition-of-emotion-recognition-in-the-workplace-and-education-institutions/ [snippet]

**Products and projects**
- EndeavorRx https://www.endeavorrx.com/ · Joon https://www.joonapp.io/ · Goally https://getgoally.com/ · Tiimo https://www.tiimoapp.com/ · Mightier https://www.mightier.com/ · Khanmigo https://www.khanmigo.ai/pricing · ClassDojo https://www.classdojo.com/ · Bookbot https://www.bookbotkids.com/ · BrainPOP https://www.brainpop.com/discover/plans
- TDAH https://github.com/emys-alb/TDAH · Pointsy https://github.com/Highfivery/Pointsy · Kids-Reward-Chart-System https://github.com/chapdad031167/Kids-Reward-Chart-System · Ahloom https://github.com/Jeetkarsh/Ahloom · SPARK robot https://github.com/adrianwedd/spark · EFingPlanner https://github.com/franklesniak/EFingPlanner · text-vide https://github.com/Gumball12/text-vide · OpenDyslexic https://github.com/antijingoist/opendyslexic · awesome-adhd https://github.com/XargsUK/awesome-adhd

**Open checks:** NICE NG87 (not opened), Walkington effect sizes, the 2024 personalisation meta-analysis pooled g, DPDP Rule 10 commencement, Vanderbilt licence terms.
