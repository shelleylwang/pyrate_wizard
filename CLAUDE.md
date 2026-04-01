# PyRate Wizard — Project Guide

## What This Is

An interactive React web app that guides paleontologists and evolutionary biologists through setting up PyRate analyses. It lives as a `.jsx` artifact renderable inside Claude.ai (users with Claude Pro can open it directly), but could also be deployed as a standalone React app.

PyRate is a Bayesian framework for estimating speciation, extinction, and preservation rates from fossil occurrence data. It has dozens of flags, multiple model types, and many silent failure modes. This wizard replaces 111 pages of my notes with a step-by-step decision tree that builds the exact terminal command users need.

## Architecture

### Three-Layer Design

1. **Deterministic decision tree** (`TREE` object): Branching questions in plain biology language. Each node has a question, subtitle, built-in explanation, and options. Options carry `tags` that accumulate as the user progresses — these tags drive command generation at the end. This layer works with zero API calls.

2. **Static knowledge base** (`KB` object): Each topic has a `plain` field (biology-first language) and a `technical` field (flags, syntax, gotchas). The plain text populates the "What you should know" boxes. The technical text is behind a toggle. No API needed.

3. **Optional AI chat**: A collapsible chat panel at each step that calls the Claude API (Sonnet) for deeper questions. Degrades gracefully — if no API key, the app still fully functions via layers 1 and 2.

### Command Generation

The `CmdBuilder` component tries the Claude API first for a tailored command, but has a complete deterministic `fallback()` function that builds commands from tags alone. Every generated command has inline `#` comments explaining flags in plain English.

### Decision Flow

```
start → data prep OR model selection OR post-processing OR SLURM
  ├─ data: source → extant? → replicates → goal
  ├─ goal: standard div | env correlate | DES | trait | BDNN | ADE
  │   ├─ standard: preservation → BD approach → dataset size → MCMC settings → generate
  │   ├─ env: prereq check → type (DD/single/MBD) → shape → generate
  │   ├─ DES: input → type → extras → generate
  │   ├─ BDNN: explain → predictors → extinct? → network size → generate
  │   ├─ trait: type → which rates → generate
  │   └─ ADE: explain → preservation check → generate
  ├─ postprocess: combine | RTT plots | model probs | ginput | BDNN post
  └─ SLURM: analysis type → generate
```

## Source Material

Two Word documents contain the expert knowledge base:
- `notes/PyRate_Notes_Tutorials.docx` — 52 pages of practical how-to: flags, arguments, code, workflows, file naming conventions, output interpretation. This is the primary source for command building and warnings.
- `notes/PyRate_Notes_Concepts.docx` — 59 pages of conceptual/mathematical background: Bayesian inference, MCMC, Poisson processes, birth-death models, neural networks. This is the primary source for the explanatory text.

Key content areas covered:
- Tutorial 1: Data prep, preservation models, basic MCMC, output post-processing
- Tutorial 2: PyRateContinuous (diversity dependence, environmental correlates, model comparison via TI)
- Tutorial 3: RJMCMC specifics
- Tutorial 4: MCDD, MBD, CoVar, ADE, BDC
- Tutorial 5: DES (dispersal-extinction-sampling) with all variants
- BDNN Tutorial: Neural network setup, data prep, custom predictors, post-processing
- Additional: parallelization warnings, file naming conventions, troubleshooting, MCMC tuning

## Critical PyRate Gotchas (Must Be Preserved in the Tool)

These are silent failures — PyRate gives no error but produces wrong results:

1. `-fixShift` with `-A 4` (RJMCMC) → silently reverts to `-A 0` (constant rates)
2. `-r` (parallelization) with `-A 4` → silently reverts to `-A 0`
3. BDNN always uses `-A 0` regardless of what you specify
4. `-thread > 0` may also force `-A 0`
5. Output files named "BD1-1" = ran with `-A 0`, not RJMCMC
6. `-A 0` and `-A 4` logs have different column counts → cannot be combined
7. `-combLog` without `-tag` → tries to combine incompatible file types
8. Old combined files in directory → `-combLogRJ` fails silently
9. `-TdD`/`-TdE` must NOT be combined with `-varD`/`-varE` in DES
10. DES `-translate` can only use Skyline model afterward
11. BDNN with small networks: `-BDNNupdate_f` default rounds to 0 weights updated
12. `-ginput` only works on non-RJMCMC output
13. ADE and Gibbs sampler only work with HPP or TPP preservation
14. Negative trait values + log transformation = error
15. Adding extant species without fossil records inflates rates

## Design Principles

### Language
- **Biology first, software second.** Questions use evolutionary/paleontological terms. Technical flags appear in hints, toggles, or parentheticals — never as the primary question text.
- Users are biologists who understand speciation, extinction, phylogenetics, and fossil records. They do NOT know Bayesian statistics, MCMC, or command-line conventions.
- When introducing a PyRate concept, frame it as "what biological question does this answer?" before explaining the mechanism.

### UX
- Each step should feel like talking to a knowledgeable colleague, not reading a manual.
- Warnings about silent failures should be prominent and appear IN the decision flow, not buried in notes.
- The "What you should know" box at each step is the primary teaching tool — it should be well-written and specific.
- The AI chat is a bonus, not a crutch. The app must work perfectly without it.

### Aesthetics
- Dark warm palette (fossil/earth tones): background `#151210`, text `#d8ccb8`, accents `rgba(120,90,60,*)`.
- Fonts: Source Serif 4 for headings, DM Sans for body, JetBrains Mono for code/technical.
- Subtle animations on step transitions. No flashy effects.
- Clean, uncluttered layout — max width 660px, generous padding.

## Code Style & Comments

### Comment Philosophy
Use short, navigational comments that help a human find specific sections quickly. Think of them as signposts, not explanations. The person maintaining this code is not a developer — they need to find "where is the question about preservation?" or "where do I change the BDNN explanation text?" without reading code logic, so that they can insert changes exactly where they are visually needed in the UI.

**Do this:**
```jsx
// -- Preservation model question
pres_explain: {
```

```jsx
// -- Command: standard PyRate diversification
} else {
```

```jsx
{/* -- Option buttons */}
<div style={{ display: "flex", ...
```

**Don't do this:**
```jsx
// Using Claude AI to generate contextual explanation based on user's
// accumulated tags and the knowledge base entry for this topic
// This was implemented per conversation on March 31 2026
```

### Specific Guidelines
- Mark each `TREE` node with a `// -- Section: Name` comment above it
- Mark each `KB` entry with a `// -- KB: Topic` comment
- In the command builder fallback, mark each command type branch with `// -- Cmd: type`
- In JSX rendering sections, use `{/* -- UI: description */}` to mark major visual blocks
- Keep comments to one line. If someone needs to change "the text about preservation," they should be able to Ctrl+F for `preservation` and land near the right spot.
- Do NOT add comments explaining React patterns, JavaScript syntax, or how the state management works.
- Do NOT add comments that reference this being AI-generated, Claude, prompts, or conversations.

## What Still Needs Work

### Content
- [ ] Add images/diagrams at certain decision nodes (user wants to insert these manually — make sure the JSX structure allows dropping in `<img>` tags easily near explanation boxes)
- [ ] Review and refine all explanation texts for accuracy and tone
- [ ] Add the ADE-NN tutorial content (currently only Bayesian ADE is covered)
- [ ] Add DeepDive (separate software) comparison notes where relevant
- [ ] Some `KB.technical` entries could be more complete — cross-reference with the source docs
- [ ] The DES input file creation workflow could be more detailed (the -fossil/-recent file prep)

### Functionality
- [ ] The command builder fallback doesn't cover every tag combination — some edge cases may produce incomplete commands
- [ ] Add a "review all choices" summary panel before command generation
- [ ] Add ability to export the generated command as a `.sh` file
- [ ] Add a "common workflows" shortcut — e.g., "I just want the standard recommended analysis" that pre-selects defaults
- [ ] Consider adding a "what files do I need?" checklist at the generate step based on tags
- [ ] The SLURM script generation could be more customizable (partition name, email notifications, module names)

### Polish
- [ ] Mobile responsiveness (currently designed for desktop)
- [ ] Smooth scroll-to-top on node transitions
- [ ] Keyboard navigation (Enter to select highlighted option, arrow keys)
- [ ] Consider adding a dark/light theme toggle
- [ ] Test all decision paths end-to-end to make sure no path dead-ends

### Deployment Options
- Currently: renderable as a Claude.ai artifact (`.jsx` file)
- Future: could be built as a standalone React app with `create-react-app` or Vite
- Future: could be deployed to GitHub Pages for team-wide access via URL
- If deploying standalone: the Claude API calls would need an API key input field or env variable

## File Structure (Current)

```
pyrate-wizard/
  CLAUDE.md              ← this file
  pyrate_wizard.jsx      ← the complete app (single-file React component)
  notes/
    PyRate_Notes_Tutorials.docx
    PyRate_Notes_Concepts.docx
```

## File Structure (If Expanding Later)

```
pyrate-wizard/
  CLAUDE.md
  src/
    App.jsx              ← main app shell
    tree.js              ← decision tree data (TREE object)
    knowledge.js         ← knowledge base data (KB object)
    commands.js          ← deterministic command builder logic
    components/
      Chat.jsx           ← AI chat panel
      CmdBuilder.jsx     ← command generation UI
      StepView.jsx       ← question/options rendering
  notes/
    PyRate_Notes_Tutorials.docx
    PyRate_Notes_Concepts.docx
  public/
    images/              ← for diagrams/screenshots at decision nodes
```

## Quick Reference: How to Make Common Changes

**Change question text for a step:** Search for the node ID (e.g., `pres_explain`) in the `TREE` object. Edit the `question`, `subtitle`, or `explain` fields.

**Change an option's label or add a hint:** Find the node, find the option in its `options` array, edit `label` or `hint`.

**Add a new decision node:** Add a new entry to `TREE` with a unique `id`, then point to it from another node's option `next` field.

**Change the explanation text:** Find the topic key in `KB` (e.g., `preservation`). Edit `plain` for biology language or `technical` for flag details.

**Add an image to a step:** In the JSX where the explanation box renders (search for `What you should know`), add an `<img>` tag inside the explanation div. Images should go in a `/public/images/` directory if deploying standalone, or be base64-encoded for the artifact version.

**Change command generation for a specific analysis type:** In the `fallback()` function inside `CmdBuilder`, search for the relevant tag (e.g., `bdnn`, `des`, `covar`). Each branch is marked with a comment.

**Change visual styling:** Colors and fonts are inline styles. Search for the hex value or font name to find all instances. Key values: background `#151210`, text `#d8ccb8`, accent `rgba(120,90,60,*)`.
