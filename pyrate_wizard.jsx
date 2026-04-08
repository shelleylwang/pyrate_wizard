import { useState, useEffect, useRef } from "react";

// ─── KNOWLEDGE BASE (from 60 pages of notes) ─────────────────────────────
const KB = {
  overview: {
    title: "What is PyRate?",
    plain: `PyRate is a program that estimates how fast species appeared (speciation) and disappeared (extinction) over geological time, using fossil occurrence data. It also accounts for the fact that not every species that ever lived left behind a fossil — this is called preservation bias. PyRate uses a statistical method called Bayesian inference to estimate all of these things simultaneously, giving you not just a best guess, but a range of plausible values with uncertainty.`,
    technical: `PyRate jointly estimates speciation (λ), extinction (μ), and preservation (q) rates using MCMC-based Bayesian inference. It combines a preservation model (Poisson process describing fossil sampling) with a birth-death model (continuous-time Markov process describing diversification). The MCMC algorithm explores the joint posterior distribution P(λ,μ,q,ts,te | fossil data) ∝ P(data|q,ts,te) × P(ts,te|λ,μ) × P(λ)P(μ)P(q).`
  },
  data_prep: {
    title: "Preparing Your Fossil Data",
    plain: `You start with a table of fossil occurrences — each row is one fossil find, with the species name, whether it's still alive today or extinct, and the age range of that fossil (how old it might be). PyRate needs this converted into a special input format using an R script. During this conversion, you can create multiple "replicate" datasets where each fossil's exact age is randomly sampled from within its age range — this accounts for uncertainty in dating.`,
    technical: `Input: CSV with Species, Status (extant/extinct), min_age, max_age columns. R functions extract.ages.pbdb() or extract.ages() convert to *_PyRate.py format. The replicates argument generates N datasets with runif() sampling. For site data, ages randomized per site. Output: *_PyRate.py (arrays of ages per taxon, 0 appended for extant species), *_TaxonList.txt. Check typos: python PyRate.py -check_names *_TaxonList.txt. Do NOT add extant species without fossil records. -N flag doesn't actually help.`
  },
  preservation: {
    title: "How Fossils Are Preserved",
    plain: `Not every species that lived left behind fossils, and the chance of being preserved varied over time and across different lineages. PyRate models this "preservation bias" so your speciation and extinction estimates aren't thrown off by gaps in the fossil record.`,
    technical: `HPP: constant q, -mHPP. NHPP (default): bell-shaped q(t). TPP: piecewise q per epoch, -qShift file -pP shape rate. Gamma (-mG): lineage-specific q, +1 param. -PPmodeltest for ML comparison. Gibbs sampler only with HPP/TPP. Gamma+TPP: -log_sp_q_rates for per-lineage rates. -pP 0 0 = estimate from data.`
  },
  bd_standard: {
    title: "Estimating Diversification Rates",
    plain: `This is the core of PyRate: estimating how speciation and extinction rates changed over time. The key question is whether you want the model to figure out on its own when rates changed, or whether you already have a hypothesis.`,
    technical: `RJMCMC (-A 4, default): auto rate shifts. BDMCMC (-A 2): similar, less reliable. -A 0: constant rates. -fixShift: user-defined shifts, forces -A 0 silently. -edgeShift max min: boundary corrections. CRITICAL: -fixShift+A4→A0 silently. -r+A4→A0 silently. BDNN always A0. BD1-1 in filename = A0. A0 and A4 logs have different columns, cannot combine!`
  },
  bd_continuous: {
    title: "Rates Linked to Environment",
    plain: `Instead of just asking "when did rates change?", you can ask "did rates change because of something specific?" — like temperature, sea level, or the clade's own diversity.`,
    technical: `PyRateContinuous.py -d *_se_est.txt. Requires -ginput first (non-RJMCMC only). -DD diversity dep, -c env variable. -m 0=exp, 1=lin, -1=null. Auto-shifted and rescaled. MBD: PyRateMBD.py -var dir. Horseshoe prior default, shrinkage>0.5=significant. CoVar: -trait_file -mCov 1/2/3/4/5, -logT, -pC 0 for 2+ params. ADE: -ADE 1, HPP/TPP only.`
  },
  bd_neural: {
    title: "Neural Network Approach (BDNN)",
    plain: `The most advanced option: a neural network that can detect complex, non-linear relationships between your predictors and diversification rates — things simpler models would miss.`,
    technical: `BDNN: -BDNNmodel 1, always A0. Z-transform continuous, OHE categoricals. -fixShift speeds up. -translate for extinct clades (ALWAYS when BDNNtimetrait≠0). -BDNNnodes 4 2 for few predictors, MUST increase -BDNNupdate_f! 10% of 4=0 weights updated. -BDNN_nsim_expected_cv 0 for extinct. Backscale.txt for plotting. -BDNN_groups needs special Windows escaping.`
  },
  des: {
    title: "Biogeographic Analysis (DES)",
    plain: `If you're interested in how species moved between geographic areas and went extinct in each area, the DES model estimates dispersal and extinction rates between two regions.`,
    technical: `PyRateDES.py. 2 discrete areas. -TdD/-TdE time-dependent. -mG ALWAYS. -varD/-varE for covariates (NOT with TdD/TdE!). -translate only with Skyline. -DivdD/-DivdE diversity-dep. -traitD/-catD for traits. -A 0=Bayes, 1=TI, 2/3=ML. Present sampling assumed complete.`
  },
  mcmc: {
    title: "Running & Checking Results",
    plain: `The analysis runs millions of iterations, proposing parameter values and keeping the good ones. After it finishes, check convergence in Tracer — ESS should be ≥200 for all parameters.`,
    technical: `-n iterations (default 10M), -s sampling (default 1000). Check Tracer: ESS≥200. -combLogRJ works for everything. -combBDNN for BDNN. -combLog needs -tag. RTT: -plotRJ (RJMCMC), -plot (non-RJ), -plotBDNN (BDNN). Remove old combined files before re-combining! BD1-1 cannot combine with RJMCMC logs.`
  },
  pitfalls: {
    title: "Common Pitfalls",
    plain: `PyRate has combinations that silently change what you asked for: fixed shifts + auto detection → constant rates silently. Parallelization → constant rates silently. BD1-1 in filename = constant rates were used.`,
    technical: `-fixShift+A4→A0. -r+A4→A0. BDNN always A0. BD1-1=A0. Different column counts between A0/A4. -combLog without -tag. ADE only HPP/TPP. Gibbs only HPP/TPP. Negative traits+log=error. Extinct BDNN: -BDNN_nsim_expected_cv 0. Small BDNN networks: increase -BDNNupdate_f.`
  },
  slurm: {
    title: "Computing Cluster Submission",
    plain: `Submit jobs to run in the background. A job array runs all your replicates simultaneously — one job per replicate.`,
    technical: `SLURM sbatch --array=1-N. $SLURM_ARRAY_TASK_ID → -j flag. BDNN needs more mem/time. PyRateContinuous: 100K-1M iterations sufficient.`
  },

  // -- KB: Installation
  installation: {
    title: "Installing PyRate",
    plain: `PyRate is a Python program, so you need Python 3.10 or higher on your machine before anything else. A virtual environment is just a dedicated folder where PyRate's files will live, separated from everything else on your computer. After creating it, you install PyRate's dependencies (extra Python tools it needs) and you're ready to run analyses.`,
    technical: `# Check Python version (need 3.10+)
python --version
# (try python3 --version if the above gives an error)

# ─── Create virtual environment ───
# Mac/Linux:
python -m venv ~/pyrate_env
source ~/pyrate_env/bin/activate
# Windows:
py -m venv C:\\pyrate_env
.\\C:\\pyrate_env\\Scripts\\activate
# (pyrate_env) in your prompt = environment is active

# ─── Install dependencies ───
python -m ensurepip --upgrade
python -m pip install --upgrade pip
python -m pip install -r your_path/PyRate-master/requirements.txt

# ─── Test ───
python your_path/PyRate-master/PyRate.py -v
# "Module FastPyRateC was not found" = fine, PyRate still works

# ─── Windows only: PATH setup ───
# Add to PATH environment variables:
#   C:\\...\\Python\\Python312
#   C:\\...\\Python\\Python312\\Scripts
#   C:\\Program Files\\R\\R-4.4.1\\bin  (for plots)

# ─── FastPyRateC (optional speed library) ───
# Mac:   brew install swig && brew install curl
# Linux: sudo apt-get install swig && sudo apt-get install curl
cd your_path/PyRate-master/pyrate_lib/fastPyRateC/ModulePyrateC
bash install.sh   # automated install (Mac/Linux)`
  }
};

// ─── DECISION TREE ────────────────────────────────────────────────────────
const TREE = {
  start: {
    id: "start", topic: "overview",
    question: "Where are you in the process?",
    subtitle: "Let's figure out what you need to do next.",
    options: [
      { label: "I am a complete newbie — I need to start from scratch by downloading and installing the program on my computer", next: "install_os", tags: ["install"], icon: "🔧" },
      { label: "I'm just getting started — I need to prepare my fossil occurrence data", next: "data_source", tags: ["data_prep"], icon: "📂" },
      { label: "My data is ready — I need help choosing models and building the command to run", next: "goal", tags: [], icon: "🔬" },
      { label: "My analysis finished running — I need to process and visualize results", next: "postprocess_what", tags: ["postprocess"], icon: "📊" },
      { label: "I need to create a job submission script for our computing cluster", next: "slurm_what", tags: ["slurm"], icon: "🖥️" },
    ]
  },
  data_source: {
    id: "data_source", topic: "data_prep",
    question: "Where is your fossil data coming from?",
    subtitle: "PyRate needs fossil occurrence data — species names with age ranges. The preparation step depends on your data source.",
    explain: `Your raw data needs to be converted into a special PyRate input file using R. The exact R function depends on where your data came from. If you downloaded from the Paleobiology Database, there's a dedicated function for that format. If you built your own spreadsheet, there's a simpler function. Either way, the output is the same: a *_PyRate.py file that PyRate can read.`,
    options: [
      { label: "I downloaded occurrence data from the Paleobiology Database (PBDB)", next: "data_extant", tags: ["pbdb"], icon: "🌐" },
      { label: "I have my own spreadsheet with species, status (extant/extinct), and age ranges", next: "data_extant", tags: ["manual"], icon: "📝" },
      { label: "My fossils are grouped by excavation site, and I want ages randomized by site rather than individually", next: "data_extant", tags: ["site_data"], icon: "🗺️",
        hint: "Fossils from the same site will all get the same randomly sampled age" },
    ]
  },
  data_extant: {
    id: "data_extant", topic: "data_prep",
    question: "Are any of the species in your group still alive today?",
    subtitle: "This matters because PyRate handles living (extant) species differently from those that are completely extinct.",
    explain: `If some species are still alive, you need to tell PyRate which ones. In the input file, extant species get a "0" appended to their fossil ages, representing the present day. Important warning from the notes: do NOT add present-day "occurrences" for living species that don't have actual fossil records — this inflates your rate estimates and creates edge biases. The program's sampling model can't properly handle 100% complete modern sampling.`,
    options: [
      { label: "Yes — some species in my group are still living today", next: "data_replicates", tags: ["has_extant"], icon: "🌱" },
      { label: "No — every species in my group is extinct", next: "data_replicates", tags: ["all_extinct"], icon: "💀" },
    ]
  },
  data_replicates: {
    id: "data_replicates", topic: "data_prep",
    question: "How do you want to handle uncertainty in fossil dating?",
    subtitle: "Each fossil has an age range (oldest possible to youngest possible age). PyRate can create multiple datasets where each fossil's exact age is randomly picked from within that range.",
    explain: `Because we don't know the exact age of each fossil — only a range — PyRate lets you generate multiple "replicate" datasets. In each replicate, every fossil gets a randomly sampled age from within its range. You then run the full analysis on each replicate separately, and combine the results at the end. This propagates the dating uncertainty through your entire analysis. 10 replicates is the standard choice for most studies.`,
    options: [
      { label: "Create 10 replicate datasets (standard, recommended)", next: "goal", tags: ["rep10"], icon: "✓" },
      { label: "I want a different number of replicates", next: "goal", tags: ["rep_custom"], icon: "🔢" },
      { label: "Just one dataset, no replicates (simpler but ignores age uncertainty)", next: "goal", tags: ["rep1"], icon: "1️⃣" },
    ]
  },
  goal: {
    id: "goal", topic: "overview",
    question: "What question are you trying to answer about your group's evolutionary history?",
    subtitle: "Different research questions need different types of models. Pick the one closest to what you want to learn.",
    explain: `PyRate has several kinds of analyses depending on your question. The most common is simply asking "how did speciation and extinction rates change over time?" But you can also ask "did temperature drive these rate changes?" or "did larger-bodied species go extinct faster?" There are also specialized models for biogeography (how species moved between regions) and even neural networks for detecting complex patterns.`,
    options: [
      { label: "How did the rate of new species appearing and going extinct change over geological time?", next: "pres_explain", tags: ["standard_div"], icon: "📈",
        hint: "The most common analysis — produces rates-through-time curves showing diversification dynamics" },
      { label: "Did changes in climate or environment (temperature, sea level, etc.) drive my group's diversification?", next: "env_prereq", tags: ["env_correlate"], icon: "🌡️",
        hint: "Tests whether speciation or extinction rates correlate with an environmental variable over time" },
      { label: "How did species in my group spread between two geographic regions, and what drove local extinctions?", next: "des_input", tags: ["des"], icon: "🗺️",
        hint: "Biogeographic model estimating dispersal and area-specific extinction rates" },
      { label: "Did a measurable species trait (body size, tooth shape, etc.) affect how fast species appeared or disappeared?", next: "trait_type", tags: ["trait_analysis"], icon: "🦴",
        hint: "Tests whether a trait correlates with speciation, extinction, or both" },
      { label: "I have multiple predictors (traits + environment) and want to find complex patterns using a neural network", next: "bdnn_explain", tags: ["bdnn"], icon: "🧠",
        hint: "Most advanced approach — detects non-linear patterns that simpler models miss" },
      { label: "Did species become more or less likely to go extinct as they got older? (age-dependent extinction)", next: "ade_explain", tags: ["ade"], icon: "⏳",
        hint: "Tests whether extinction risk changes with a lineage's age" },
    ]
  },
  pres_explain: {
    id: "pres_explain", topic: "preservation",
    question: "First, we need to account for gaps in the fossil record.",
    subtitle: "Not every species that lived left behind fossils. If we don't account for this, we might mistake poor fossil preservation for low diversity. PyRate explicitly models this bias.",
    explain: `Think of it this way: if a time period has very few fossils, is that because few species existed then, or because conditions weren't good for making fossils? PyRate separates these two possibilities by modeling the preservation process. The question here is about how you think fossilization worked for your particular group of organisms.`,
    options: [
      { label: "I'm not sure which model is best — run a statistical test to compare the options", next: "pres_gamma", tags: ["ppmodeltest"], icon: "🔍",
        hint: "Recommended if you're unsure! Uses a maximum likelihood test to pick the best-fitting preservation model" },
      { label: "Preservation probably changed smoothly over each lineage's lifetime — higher in the middle, lower at the start and end", next: "pres_gamma", tags: ["nhpp"], icon: "〰️",
        hint: "The default model — works well for most datasets. No extra settings needed" },
      { label: "Preservation was roughly the same at all times — one constant rate", next: "pres_gamma", tags: ["hpp"], icon: "➖",
        hint: "The simplest model — only one parameter to estimate" },
      { label: "Preservation shifted at specific time boundaries (like geological stages or mass extinction events)", next: "pres_epochs", tags: ["tpp"], icon: "📊",
        hint: "You provide the time boundaries, and each interval gets its own estimated preservation rate" },
    ]
  },
  pres_epochs: {
    id: "pres_epochs", topic: "preservation",
    question: "You'll need a simple text file with your time boundaries.",
    subtitle: "Just a single column of numbers — the ages (in millions of years) where you think preservation rates changed. No header needed.",
    explain: `For example, if you think preservation changed at geological stage boundaries, list those boundary ages one per line. PyRate assigns each interval a separate preservation rate, drawn from a probability distribution called a gamma distribution. The default settings for this distribution (shape=1.5, rate=1.5) work for most datasets, but you can also tell PyRate to figure out the best distribution shape from your data.`,
    options: [
      { label: "Got it — I'll prepare my time boundaries file", next: "pres_gamma", tags: ["tpp"], icon: "✓" },
    ]
  },
  pres_gamma: {
    id: "pres_gamma", topic: "preservation",
    question: "Did different lineages in your group have different chances of being preserved as fossils?",
    subtitle: "For example, species with hard shells fossilize much more easily than soft-bodied species. This option lets each lineage have its own preservation rate.",
    explain: `Without this option, PyRate assumes every species in your group had equal chances of being preserved. That's often unrealistic — marine organisms preserve better than terrestrial ones, large species better than small, etc. Turning this on adds lineage-specific variation from a statistical distribution, but it only costs ONE extra parameter, so it barely increases computational complexity. The developers recommend including it in almost all analyses.`,
    options: [
      { label: "Yes — different lineages probably had different preservation potential (recommended for most datasets)", next: "bd_approach", tags: ["gamma"], icon: "✓",
        hint: "Adds minimal computational cost — only 1 extra parameter" },
      { label: "No — all species in my group had similar preservation potential", next: "bd_approach", tags: [], icon: "➖",
        hint: "Appropriate if your group is ecologically uniform (e.g., all marine bivalves)" },
    ]
  },
  bd_approach: {
    id: "bd_approach", topic: "bd_standard",
    question: "How should PyRate detect changes in speciation and extinction rates over time?",
    subtitle: "This is the most important modeling decision. It determines how PyRate identifies when your group's diversification sped up or slowed down.",
    explain: `There are two philosophies here. The first, more common approach lets the statistical algorithm explore different numbers of rate changes and their timing — it's objective and data-driven. The second approach is where YOU specify when rates might have shifted based on your knowledge of geological events (e.g., "test for a shift at the K-Pg boundary"). The first approach is recommended unless you have strong prior hypotheses about specific events driving your group's evolution.`,
    options: [
      { label: "Let the model figure out when and how many rate changes occurred — I want it to be data-driven", next: "dataset_size", tags: ["rjmcmc"], icon: "🤖",
        hint: "The recommended default. Uses an algorithm called RJMCMC that explores different numbers and timings of rate shifts" },
      { label: "I want to test for rate shifts at specific times I choose (e.g., at mass extinction boundaries or climate events)", next: "fixshift_warning", tags: ["fixshift"], icon: "📌",
        hint: "You provide a file with the times — the model estimates rate values between those fixed points" },
      { label: "I expect rates were roughly constant — just estimate one overall speciation rate and one extinction rate", next: "dataset_size", tags: ["constant_rates"], icon: "➖",
        hint: "Appropriate for groups with short time spans, few species, or if you want a baseline comparison" },
    ]
  },
  fixshift_warning: {
    id: "fixshift_warning", topic: "pitfalls",
    question: "⚠️ Important: specifying fixed shift times turns off the automatic shift-detection algorithm.",
    subtitle: "This is one of PyRate's silent behaviors — it won't show any warning, but the analysis type changes behind the scenes.",
    explain: `When you provide a file with fixed rate shift times, PyRate silently switches from the automatic algorithm to basic parameter estimation. It will ONLY estimate rates between YOUR specified time points — it won't search for any additional shifts you might have missed. If you want to set outer time boundaries (where your data starts and ends) but still let the model search freely for rate changes within those boundaries, there's a better option called "edge corrections."`,
    options: [
      { label: "That's fine — I have strong geological justification for my specific shift times", next: "dataset_size", tags: ["fixshift_confirmed"], icon: "✓" },
      { label: "Actually, I just want to set the outer time boundaries and let the model search freely within them", next: "edge_explain", tags: ["edgeshift"], icon: "🔄",
        hint: "Edge corrections: define where your sampling window starts/ends, then automatic detection runs inside" },
      { label: "Let me go back and use the automatic approach instead", next: "bd_approach", tags: [], icon: "←" },
    ]
  },
  edge_explain: {
    id: "edge_explain", topic: "bd_standard",
    question: "Set the time boundaries of your sampling window.",
    subtitle: "If your fossils only span a certain time period, the apparent diversity drop at the edges is just because your data ends there — not a real rate change. Edge corrections handle this.",
    explain: `For example, if your fossils span 66–23 Ma (the Paleogene), diversity appears to drop at both ends. But that's an artifact of your sampling window, not real biology. You set edge corrections at 66 and 23 Ma, and PyRate's automatic algorithm then searches freely for genuine rate changes within that window while accounting for the artificial boundaries.`,
    options: [
      { label: "I know both my oldest and youngest boundaries", next: "dataset_size", tags: ["edgeshift_both"], icon: "↔️" },
      { label: "I only need an oldest boundary (the youngest goes to present)", next: "dataset_size", tags: ["edgeshift_max"], icon: "→" },
    ]
  },
  dataset_size: {
    id: "dataset_size", topic: "mcmc",
    question: "Roughly how many species are in your dataset?",
    subtitle: "This affects how long the analysis takes and whether you need special settings.",
    explain: `The number of species directly affects computation time. Each species adds parameters that the algorithm needs to estimate (its true time of origination, true time of extinction). For datasets with hundreds of species, there's a faster algorithm variant called the Gibbs sampler — but it only works with certain preservation models (constant or time-binned, NOT the default smooth model). If you have a large dataset and chose the smooth preservation, you'll need more iterations instead.`,
    options: [
      { label: "Small — fewer than about 50 species", next: "mcmc_settings", tags: ["small_data"], icon: "🔹" },
      { label: "Medium — roughly 50 to 200 species", next: "mcmc_settings", tags: ["medium_data"], icon: "🔶" },
      { label: "Large — more than 200 species", next: "large_data_warn", tags: ["large_data"], icon: "🔷" },
    ]
  },
  large_data_warn: {
    id: "large_data_warn", topic: "mcmc",
    question: "With a large dataset, would you like to use a faster algorithm?",
    subtitle: "There's a faster sampling method available, but it has a restriction: it only works if you chose the constant or time-binned preservation model — NOT the default smooth model.",
    explain: `The Gibbs sampler updates parameters one at a time from their exact statistical distributions, rather than proposing random changes and seeing if they're accepted. This is much faster for large datasets. But it requires specific preservation model types. If you used the smooth default preservation, you can either switch to time-binned, or just increase the number of iterations and be patient.`,
    options: [
      { label: "Yes, use the faster method — I'm using constant or time-binned preservation", next: "mcmc_settings", tags: ["gibbs"], icon: "⚡" },
      { label: "No — I'll keep my preservation model and just increase iterations", next: "mcmc_settings", tags: ["more_iters"], icon: "🔄" },
    ]
  },
  mcmc_settings: {
    id: "mcmc_settings", topic: "mcmc",
    question: "How long should the analysis run?",
    subtitle: "The algorithm proposes new parameter values millions of times. More iterations = more reliable results, but longer computation.",
    explain: `At each iteration, PyRate proposes new values for speciation rates, extinction rates, preservation rates, and the true origination/extinction time for every species. It saves a "sample" periodically. For example, 20 million iterations saving every 5,000th gives you 4,000 posterior samples. After running, you load the output into Tracer to check that the "effective sample size" (ESS) is at least 200 for all parameters. If it's lower, you need more iterations.`,
    options: [
      { label: "Standard: 20 million iterations, sample every 5,000 (good starting point)", next: "generate", tags: ["n20m_s5k"], icon: "✓" },
      { label: "Quick test: 1 million iterations (just to check the command works before committing)", next: "generate", tags: ["n1m_s1k"], icon: "🧪" },
      { label: "Heavy: 50+ million iterations (for large or complex datasets)", next: "generate", tags: ["n50m_s10k"], icon: "💪" },
    ]
  },

  // ── ENVIRONMENT CORRELATE ──
  env_prereq: {
    id: "env_prereq", topic: "bd_continuous",
    question: "Testing environmental correlations requires a previous PyRate analysis first.",
    subtitle: "These models don't start from raw fossil data — they use the estimated speciation and extinction times from a standard PyRate run.",
    explain: `The environmental correlation models take the estimated times when each species originated and went extinct (from a standard PyRate run) and then test whether those events correlate with an environmental variable like temperature. You first need to run a basic analysis, then extract the estimated times into a new file. Important: this extraction step only works with output from basic parameter estimation — NOT from the automatic rate-shift detection algorithm. If you used the automatic algorithm, you'll need to re-run with basic settings.`,
    options: [
      { label: "I already have output from a standard PyRate analysis", next: "env_type", tags: ["has_output"], icon: "✓" },
      { label: "I haven't run anything yet — help me set up the basic analysis first", next: "pres_explain", tags: ["standard_div", "then_env"], icon: "←" },
    ]
  },
  env_type: {
    id: "env_type", topic: "bd_continuous",
    question: "What kind of environmental relationship do you want to test?",
    subtitle: "Pick the hypothesis that matches your research question.",
    explain: `"Diversity dependence" asks: does a group regulate its own diversity? As more species accumulate, does competition slow speciation or increase extinction? An "environmental variable" test asks whether something external like temperature or sea level drives the rates. The multi-variable model can test several things at once — like temperature AND sea level AND the group's own diversity — while automatically identifying which predictors actually matter.`,
    options: [
      { label: "Did my group's own species richness regulate its diversification? (self-regulation / carrying capacity)", next: "dd_shape", tags: ["dd"], icon: "🔁" },
      { label: "Did a single environmental variable (paleotemperature, sea level, etc.) drive rates?", next: "env_shape", tags: ["env_single"], icon: "🌡️" },
      { label: "I want to test multiple environmental predictors at once", next: "mbd_prior", tags: ["mbd"], icon: "📊",
        hint: "Automatically identifies which predictors are statistically supported" },
    ]
  },
  dd_shape: {
    id: "dd_shape", topic: "bd_continuous",
    question: "What shape should the diversity-rate relationship take?",
    subtitle: "Should the effect of diversity on rates accelerate as diversity grows (exponential), or be proportional (linear)?",
    explain: `If you're not sure, the best approach is to run three analyses — exponential, linear, and a null model with no diversity effect — then compare them statistically. PyRate has a model comparison method (thermodynamic integration) that tells you which fits best while automatically penalizing more complex models.`,
    options: [
      { label: "Exponential — small diversity changes have bigger effects at high diversity", next: "generate", tags: ["dd_exp"], icon: "📈" },
      { label: "Linear — the effect is proportional to diversity", next: "generate", tags: ["dd_lin"], icon: "📏" },
      { label: "Test both + a constant-rate null model and statistically compare them (recommended)", next: "generate", tags: ["dd_compare"], icon: "🔍" },
    ]
  },
  env_shape: {
    id: "env_shape", topic: "bd_continuous",
    question: "What shape and do you want formal model comparison?",
    explain: `Adding a formal comparison runs each model multiple times at different statistical "temperatures" to estimate which fits your data best while penalizing unnecessary complexity. This multiplies your total computation time by about 10×, but gives you rigorous statistical support for your chosen model.`,
    options: [
      { label: "Exponential relationship", next: "generate", tags: ["env_exp"], icon: "📈" },
      { label: "Linear relationship", next: "generate", tags: ["env_lin"], icon: "📏" },
      { label: "Run both + formal model comparison (most thorough but ~10× more computation)", next: "generate", tags: ["env_ti_compare"], icon: "🔍" },
    ]
  },
  mbd_prior: {
    id: "mbd_prior", topic: "bd_continuous",
    question: "The multi-variable model automatically identifies which predictors matter. Which method should it use?",
    subtitle: "With multiple predictors, there's a risk of 'overfitting' — finding false patterns. The model uses statistical shrinkage to prevent this.",
    explain: `The "horseshoe prior" is a statistical technique that automatically pushes weak effects toward zero, separating real signals from noise. A predictor with a shrinkage weight above 0.5 is considered statistically supported. The developers strongly recommend always using this option. The alternative (gamma hyper-priors) is simpler but less effective at distinguishing signal from noise.`,
    options: [
      { label: "Horseshoe prior — automatic signal vs. noise detection (always recommended)", next: "generate", tags: ["mbd_horseshoe"], icon: "✓" },
      { label: "Gamma hyper-priors — simpler approach (the developer says horseshoe is always better)", next: "generate", tags: ["mbd_gamma"], icon: "📊" },
    ]
  },

  // ── TRAIT ──
  trait_type: {
    id: "trait_type", topic: "bd_continuous",
    question: "What kind of trait are you testing?",
    subtitle: "The type of trait determines which model is appropriate.",
    explain: `Continuous traits (numbers you can measure, like body mass) work with the simpler correlation model built into PyRate. Important: traits that are always positive should be log-transformed first. Categorical traits (groups like "carnivore" vs. "herbivore") need the neural network approach, which converts each category into separate binary (yes/no) columns. If you have both types, the neural network can handle them together.`,
    options: [
      { label: "A continuous measurement (body mass, tooth length, limb proportions, etc.)", next: "covar_which_rates", tags: ["covar"], icon: "📏" },
      { label: "A categorical classification (diet type, habitat, locomotion mode, etc.)", next: "bdnn_explain", tags: ["bdnn", "cat_trait"], icon: "🏷️" },
      { label: "I have both continuous and categorical traits", next: "bdnn_explain", tags: ["bdnn", "mixed_traits"], icon: "📊" },
    ]
  },
  covar_which_rates: {
    id: "covar_which_rates", topic: "bd_continuous",
    question: "Which evolutionary rates do you think the trait affects?",
    subtitle: "The trait could influence how fast species appear, how fast they disappear, how well they're preserved as fossils, or any combination.",
    explain: `Each rate you test adds one statistical parameter. If you're testing the trait's effect on all three rates simultaneously, it's recommended to let PyRate estimate the uncertainty in the correlation from the data itself rather than fixing it, which produces more reliable results.`,
    options: [
      { label: "Speciation — does the trait affect how fast new species evolve?", next: "generate", tags: ["mcov1", "covar"], icon: "🌱" },
      { label: "Extinction — does the trait affect how likely species are to go extinct?", next: "generate", tags: ["mcov2", "covar"], icon: "💀" },
      { label: "Both speciation and extinction", next: "generate", tags: ["mcov3", "covar"], icon: "↕️" },
      { label: "All three: speciation, extinction, and preservation", next: "generate", tags: ["mcov5", "covar"], icon: "🔬" },
    ]
  },

  // ── BDNN ──
  bdnn_explain: {
    id: "bdnn_explain", topic: "bd_neural",
    question: "The neural network approach is powerful but requires careful data preparation.",
    subtitle: "It can detect complex, non-linear relationships between multiple predictors and diversification rates — patterns that simpler models would miss entirely.",
    explain: `Before running, your data needs specific preparation: numerical traits and environmental variables should be statistically standardized (centered at 0, scaled by standard deviation). Traits that are always positive (like body mass) must be log-transformed first, THEN standardized. Categorical traits need to be converted to binary columns (one column per category, each containing 0 or 1). You also need to save the original means and standard deviations so that plots later can show results in meaningful units. This prep work is done in Python or R before running PyRate.`,
    options: [
      { label: "I understand — let's continue with the setup", next: "bdnn_predictors", tags: ["bdnn_ready"], icon: "✓" },
      { label: "This sounds complex — maybe I should use a simpler model first", next: "goal", tags: [], icon: "←" },
    ]
  },
  bdnn_predictors: {
    id: "bdnn_predictors", topic: "bd_neural",
    question: "What kinds of predictors do you want to include?",
    subtitle: "You can use species-specific traits, environmental variables that change over time, or both.",
    explain: `Species traits differ between species but don't change over time (body size, diet, number of teeth). Time-varying predictors are environmental variables that change over geological time but affect all species (global temperature, sea level, atmospheric CO₂). The neural network combines these into a single model, with time itself automatically added as a predictor — this lets the network learn gradual trends in rates over time.`,
    options: [
      { label: "Species traits only (body size, diet, etc.)", next: "bdnn_extinct", tags: ["bdnn_traits"], icon: "🦴" },
      { label: "Time-varying environmental predictors only (paleotemperature, etc.)", next: "bdnn_extinct", tags: ["bdnn_timevar"], icon: "🌡️" },
      { label: "Both species traits AND environmental predictors", next: "bdnn_extinct", tags: ["bdnn_both"], icon: "📊" },
    ]
  },
  bdnn_extinct: {
    id: "bdnn_extinct", topic: "bd_neural",
    question: "Are all species in your group extinct, or do some still exist today?",
    subtitle: "For entirely extinct groups, there's a critical optimization step that can make the analysis run 10× faster.",
    explain: `If all your species went extinct millions of years ago, there's a huge gap between their most recent fossil and the present day. The neural network creates a computational matrix for every time interval in that gap — wasting enormous time on empty bins with no data. A "time shift" flag moves your entire dataset closer to the present, eliminating the empty gap. You should ALWAYS use this for entirely extinct groups when time is included as a predictor (which is the default). Without it, analyses that should take hours can take days.`,
    options: [
      { label: "All extinct — use the time-shift optimization (strongly recommended)", next: "bdnn_network", tags: ["extinct_translate"], icon: "💀" },
      { label: "Some are still alive — no time-shift needed", next: "bdnn_network", tags: ["bdnn_extant"], icon: "🌱" },
    ]
  },
  bdnn_network: {
    id: "bdnn_network", topic: "bd_neural",
    question: "How many total predictors (traits + environmental variables) do you have?",
    subtitle: "This determines the size of the neural network. Too complex for few predictors = overfitting. Too simple for many = missing real patterns.",
    explain: `The neural network has layers of processing units ("nodes"). The default is 2 layers with 18 and 8 nodes — suitable for moderate numbers of predictors. If you only have 1-3 predictors, you MUST shrink the network, but here's a critical gotcha: when you shrink the network, the algorithm normally updates 10% of connections per step. With only 4 connections, 10% rounds down to ZERO — meaning nothing gets updated and the model can't learn! You must also increase the update percentage. This is one of the most common mistakes with BDNN.`,
    options: [
      { label: "1–3 predictors — use a smaller network (critical: update settings must also change!)", next: "generate", tags: ["bdnn_small_net"], icon: "🔹",
        hint: "Will use a smaller network with increased update frequency — both changes are required" },
      { label: "4–8 predictors — the default network should work well", next: "generate", tags: ["bdnn_default_net"], icon: "🔶" },
      { label: "9+ predictors — may need a larger network", next: "generate", tags: ["bdnn_large_net"], icon: "🔷" },
    ]
  },

  // ── ADE ──
  ade_explain: {
    id: "ade_explain", topic: "bd_continuous",
    question: "Age-dependent extinction tests whether species become more vulnerable as they age.",
    subtitle: "Important limitation: this model assumes the background extinction rate is constant. Only use it within time windows where rates are roughly stable.",
    explain: `This model fits a mathematical curve (Weibull distribution) to extinction risk as a function of how long a species has existed. If the shape parameter equals 1, there's no age dependence. Greater than 1 means older species go extinct faster. This model CANNOT be used with the automatic rate-shift algorithm — it requires either constant or time-binned preservation. Also, it should only be applied within time periods where overall rates are fairly stable (no mass extinctions in the middle).`,
    options: [
      { label: "I'm using time-binned preservation — set up ADE", next: "generate", tags: ["ade_tpp"], icon: "📊" },
      { label: "I'm using constant preservation — set up ADE", next: "generate", tags: ["ade_hpp"], icon: "➖" },
      { label: "I chose the smooth default preservation — I'd need to switch models", next: "pres_explain", tags: ["ade_switch"], icon: "🔄",
        hint: "ADE requires either constant or time-binned preservation — not the smooth default" },
    ]
  },

  // ── DES ──
  des_input: {
    id: "des_input", topic: "des",
    question: "The biogeographic model needs fossils classified into two geographic regions.",
    subtitle: "Each fossil occurrence must be assigned to Area A or Area B. You also need a table showing where each species occurs today (or most recently).",
    explain: `The DES model works with exactly two geographic areas — think "North America vs. Eurasia" or "marine vs. terrestrial." You need two files: one with your fossil occurrences and their area assignments, and one with the most recent known distribution of each species. If a species occurs in both areas, it gets two rows in the recent file. Areas should represent native ranges (avoid areas where humans introduced species). The model assumes present-day distributions are known with certainty.`,
    options: [
      { label: "My fossils are already classified into two areas — let's set up the analysis", next: "des_type", tags: ["des_ready"], icon: "✓" },
      { label: "I need to classify fossils from coordinates using the speciesgeocodeR R package", next: "des_type", tags: ["des_coords"], icon: "🗺️" },
    ]
  },
  des_type: {
    id: "des_type", topic: "des",
    question: "What's your main biogeographic question?",
    explain: `All DES models estimate: dispersal rates between areas (A→B and B→A, which can differ), extinction rates in each area, and preservation rates in each area. The difference is whether these rates are constant, change over time, or depend on some predictor. You should almost always include lineage-specific preservation variation — it barely increases computation but improves rate estimates.`,
    options: [
      { label: "How did dispersal and extinction rates change over geological time?", next: "des_extras", tags: ["des_skyline"], icon: "📈",
        hint: "Time-varying rates with shifts at time boundaries you specify" },
      { label: "Did an environmental variable (climate, land bridges, etc.) drive dispersal or extinction?", next: "des_extras", tags: ["des_covar"], icon: "🌡️",
        hint: "⚠️ Cannot be combined with the time-varying option above — the covariate captures the time variation" },
      { label: "Did the number of species already in an area affect dispersal into or extinction within it?", next: "des_extras", tags: ["des_divd"], icon: "🔁" },
      { label: "Just estimate constant rates between the two areas", next: "des_extras", tags: ["des_constant"], icon: "➖" },
    ]
  },
  des_extras: {
    id: "des_extras", topic: "des",
    question: "Any additional features?",
    options: [
      { label: "Add trait effects on rates (body size affects dispersal ability, etc.)", next: "generate", tags: ["des_trait", "des_mg"], icon: "🦴" },
      { label: "Just include lineage-specific preservation variation (recommended)", next: "generate", tags: ["des_mg"], icon: "✓" },
      { label: "No extras", next: "generate", tags: [], icon: "➖" },
    ]
  },

  // ── POST-PROCESSING ──
  postprocess_what: {
    id: "postprocess_what", topic: "mcmc",
    question: "What do you need to do with your results?",
    options: [
      { label: "Combine results from multiple replicate runs into one", next: "combine_which", tags: ["combine"], icon: "🔗" },
      { label: "Make rates-through-time plots (speciation and extinction over geological time)", next: "rtt_which", tags: ["rtt"], icon: "📈" },
      { label: "Check which number of rate shifts has the best statistical support", next: "generate", tags: ["mprob"], icon: "📊",
        hint: "Shows the probability of 0, 1, 2, 3... rate shifts in speciation and extinction" },
      { label: "Extract estimated origination/extinction times for use in environmental correlation models", next: "generate", tags: ["ginput"], icon: "📤",
        hint: "⚠️ Only works with output from basic parameter estimation, NOT automatic shift detection" },
      { label: "Process neural network results (which predictors matter, how they affect rates)", next: "bdnn_post_what", tags: ["bdnn_post"], icon: "🧠" },
    ]
  },
  combine_which: {
    id: "combine_which", topic: "mcmc",
    question: "What type of analysis did you run?",
    explain: `There's a combining command that works for virtually all analysis types — it's the recommended default. For BDNN specifically, there's a dedicated combiner. Important: if you've combined files before and the combined files are still in the same directory, the combiner will fail! Move old combined files out first.`,
    options: [
      { label: "Any standard PyRate or RJMCMC analysis (this works for almost everything)", next: "generate", tags: ["combrj"], icon: "✓" },
      { label: "BDNN neural network analysis", next: "generate", tags: ["combbdnn"], icon: "🧠" },
    ]
  },
  rtt_which: {
    id: "rtt_which", topic: "mcmc",
    question: "Which type of analysis produced your results?",
    subtitle: "Different analysis types require different plotting commands. Using the wrong one gives errors or misleading plots.",
    explain: `Quick guide: if your output folder has files called sp_rates.log and ex_rates.log, you likely used the automatic shift-detection algorithm and should use the RJMCMC plotting command. If it has marginal_rates.log instead, use the standard plotting command. For BDNN, there's a dedicated plotter. A common mistake is using the wrong plotter — it might not crash, but the plot will be wrong.`,
    options: [
      { label: "I used the automatic rate-shift detection (the default)", next: "generate", tags: ["plotrj"], icon: "📈" },
      { label: "I used constant rates or fixed shift times", next: "generate", tags: ["plot_marginal"], icon: "📉" },
      { label: "I used the neural network (BDNN)", next: "generate", tags: ["plotbdnn"], icon: "🧠" },
      { label: "I used environmental correlations (PyRateContinuous)", next: "generate", tags: ["plot_continuous"], icon: "🌡️" },
    ]
  },
  bdnn_post_what: {
    id: "bdnn_post_what", topic: "bd_neural",
    question: "Which neural network results do you need?",
    options: [
      { label: "Rates through time (how speciation and extinction changed over geological time)", next: "generate", tags: ["bdnn_rtt"], icon: "📈" },
      { label: "How each predictor individually affects rates (partial dependence plots)", next: "generate", tags: ["bdnn_pdp"], icon: "📊",
        hint: "Shows what happens to rates when you change one predictor while holding everything else constant" },
      { label: "Which predictors matter most? (statistical importance ranking)", next: "bdnn_pred_extinct", tags: ["bdnn_pred"], icon: "🏆" },
      { label: "Combined effects of 3+ predictors (interaction analysis)", next: "generate", tags: ["bdnn_interaction"], icon: "🔗" },
    ]
  },
  bdnn_pred_extinct: {
    id: "bdnn_pred_extinct", topic: "bd_neural",
    question: "Is your group entirely extinct?",
    subtitle: "This affects one specific calculation in the predictor importance analysis.",
    explain: `The importance analysis runs a simulation to check whether the variation in your rates is greater than expected under a model with no real variation. For extinct groups, this simulation doesn't work correctly, so you need to skip it. The predictor rankings still work fine — you just can't do the "is there more variation than expected by chance?" test.`,
    options: [
      { label: "Yes, all extinct — skip the variation simulation", next: "generate", tags: ["bdnn_pred_extinct"], icon: "💀" },
      { label: "No, some are extant — run the full analysis", next: "generate", tags: ["bdnn_pred_extant"], icon: "🌱" },
    ]
  },

  // ── SLURM ──
  slurm_what: {
    id: "slurm_what", topic: "slurm",
    question: "What analysis are you submitting to the cluster?",
    subtitle: "I'll generate a SLURM batch script that runs each replicate as a separate parallel job.",
    options: [
      { label: "Standard PyRate diversification analysis", next: "generate", tags: ["slurm_standard"], icon: "📈" },
      { label: "BDNN neural network (needs more memory and time)", next: "generate", tags: ["slurm_bdnn"], icon: "🧠" },
      { label: "Environmental correlation (PyRateContinuous)", next: "generate", tags: ["slurm_continuous"], icon: "🌡️" },
      { label: "Biogeographic analysis (DES)", next: "generate", tags: ["slurm_des"], icon: "🗺️" },
    ]
  },

  // ── INSTALLATION ──
  install_os: {
    id: "install_os", topic: "installation",
    question: "Let's get PyRate installed on your computer!",
    subtitle: "You don't need to know how to code — we'll go step by step. First things first: what kind of computer are you using?",
    explain: `PyRate runs using Python — you don't need to learn Python at all, it just needs to be on your machine.

## Check if you already have it

Open a **Terminal** window:
- **Mac:** press \`Command+Space\`, search "Terminal," press Enter
- **Windows:** press the Windows key, search "Command Prompt," press Enter

Once it's open, type the following and press Enter:

\`\`\`
python --version
\`\`\`

If you see something like \`Python 3.11.2\`, you're all set. If nothing comes up, or the version number is below 3.10, visit [python.org](https://www.python.org/downloads/) and download the latest version before continuing.

If \`python\` gives an error, try \`python3 --version\` instead — the command name varies by installation.`,
    options: [
      { label: "I'm on a Mac or Linux", next: "install_mac", tags: ["install_mac"], icon: "🍎" },
      { label: "I'm on Windows", next: "install_windows", tags: ["install_windows"], icon: "🪟" },
    ]
  },
  install_mac: {
    id: "install_mac", topic: "installation",
    question: "Mac/Linux: four steps to get PyRate running.",
    subtitle: "Keep your Terminal open and follow along. The exact commands to copy-paste are in the technical details panel below.",
    explain: `Keep your Terminal open and follow along — each step has the exact command to copy-paste.

## Step 1 — Create a virtual environment

A virtual environment is a dedicated folder where PyRate's files will live, cleanly separated from everything else on your computer.

\`\`\`
python -m venv ~/pyrate_env
\`\`\`

If you get an error, try \`python3\` instead of \`python\` — it depends on how Python was installed.

## Step 2 — Activate it

\`\`\`
source ~/pyrate_env/bin/activate
\`\`\`

You'll see \`(pyrate_env)\` appear at the start of your terminal line — that means it's active.

## Step 3 — Download and install PyRate

Go to [PyRate's GitHub page](https://github.com/dsilvestro/PyRate), click the green **Code** button, and choose **Download ZIP**. This downloads the repo to your local machine (computer). On your computer, go to your Downloads folder. Unzip the downloaded file somewhere easy to find. You'll get a folder called \`PyRate-master\`.

Back in Terminal, install PyRate's dependencies with these three commands in order:

\`\`\`
python -m ensurepip --upgrade
python -m pip install --upgrade pip
python -m pip install -r your_path/PyRate-master/requirements.txt
\`\`\`

Replace \`your_path\` with the actual location of your \`PyRate-master\` folder.

## Step 4 — Test it

\`\`\`
python your_path/PyRate-master/PyRate.py -v
\`\`\`

If you see a version number, you're all set. If you see **"Module FastPyRateC was not found"** — don't worry, that's normal. PyRate works fine without it; it's an optional speed library you can install separately.`,
    options: [
      { label: "It worked — I'm ready to prepare my fossil data next", next: "data_source", tags: [], icon: "📂" },
      { label: "My data is already prepared — take me to model selection", next: "goal", tags: [], icon: "🔬" },
      { label: "I also want to install the optional FastPyRateC speed library", next: "install_fastc", tags: ["fastc"], icon: "⚡" },
    ]
  },
  install_windows: {
    id: "install_windows", topic: "installation",
    question: "Windows: four steps to get PyRate running.",
    subtitle: "Keep your Command Prompt open and follow along. The exact commands to copy-paste are in the technical details panel below.",
    explain: `Keep your Command Prompt open and follow along. On Windows, use \`py\` instead of \`python\`.

## Step 1 — Create a virtual environment

A virtual environment is a dedicated folder where PyRate's files will live, away from everything else.

\`\`\`
py -m venv C:\\pyrate_env
\`\`\`

## Step 2 — Activate it

\`\`\`
C:\\pyrate_env\\Scripts\\activate
\`\`\`

You'll see \`(pyrate_env)\` appear at the start of your prompt — that means it's active.

## Step 3 — Download and install PyRate

Go to [PyRate's GitHub page](https://github.com/dsilvestro/PyRate), click the green **Code** button, and choose **Download ZIP**. Unzip it somewhere easy to find — your Desktop is fine. You'll get a folder called \`PyRate-master\`.

Back in Command Prompt, install PyRate's dependencies with these three commands in order. Use backslashes in the path:

\`\`\`
py -m ensurepip --upgrade
py -m pip install --upgrade pip
py -m pip install -r your_path\\PyRate-master\\requirements.txt
\`\`\`

Replace \`your_path\` with the actual location of your \`PyRate-master\` folder.

## Step 4 — Test it

\`\`\`
py your_path\\PyRate-master\\PyRate.py -v
\`\`\`

If you see a version number, PyRate is installed.

## Step 5 — Add Python to your PATH

Windows needs one extra step so it can find Python. Open **System Settings**, search for **"Edit environment variables,"** and add these two entries to PATH:

- Your Python folder — something like \`C:\\Python\\Python312\`
- Its Scripts subfolder — \`C:\\Python\\Python312\\Scripts\`

If you plan on making plots, also add your R \`bin\` folder, e.g. \`C:\\Program Files\\R\\R-4.4.1\\bin\`.`,
    options: [
      { label: "All done — I'm ready to prepare my fossil data next", next: "data_source", tags: [], icon: "📂" },
      { label: "My data is already prepared — take me to model selection", next: "goal", tags: [], icon: "🔬" },
      { label: "I also want to install the optional FastPyRateC speed library", next: "install_fastc", tags: ["fastc"], icon: "⚡" },
    ]
  },
  install_fastc: {
    id: "install_fastc", topic: "installation",
    question: "Installing the FastPyRateC speed library (optional).",
    subtitle: "This is not required — PyRate runs without it. But if you plan on running many analyses, it's worth the extra setup.",
    explain: `FastPyRateC is an optional add-on written in C++ that speeds up some of PyRate's calculations. PyRate works fine without it, but it's worth installing if you plan to run many analyses.

## Mac / Linux

First, install two required tools.

**On Mac** — you need [Homebrew](https://brew.sh) installed first, then:

\`\`\`
brew install swig
brew install curl
\`\`\`

**On Linux** instead:

\`\`\`
sudo apt-get install swig
sudo apt-get install curl
\`\`\`

Then navigate into the FastPyRateC folder and run the installer:

\`\`\`
cd your_path/PyRate-master/pyrate_lib/fastPyRateC/ModulePyrateC
bash install.sh
\`\`\`

This needs an internet connection and may take a few minutes. When done, run \`PyRate.py -v\` again — the "FastPyRateC not found" message should be gone.

## Windows

Windows installation requires manually compiling the C++ module. See the **technical details** panel below for the exact steps.`,
    options: [
      { label: "Done — I'm ready to prepare my fossil data next", next: "data_source", tags: [], icon: "📂" },
      { label: "My data is already prepared — take me to model selection", next: "goal", tags: [], icon: "🔬" },
    ]
  },

  // ── GENERATE ──
  generate: {
    id: "generate", topic: "pitfalls",
    question: "All set — let's build your command!",
    subtitle: "Review your choices in the trail above. Use the Back button if anything needs changing.",
    terminal: true,
    options: []
  }
};

// ─── MARKDOWN RENDERER ───────────────────────────────────────────────────
function MiniMarkdown({ children }) {
  if (!children) return null;

  const parseInline = (text, prefix) => {
    const parts = [];
    let s = text, k = 0;
    const patterns = [
      { re: /`([^`]+)`/, render: m => <code key={prefix + k++}>{m[1]}</code> },
      { re: /\*\*([^*]+)\*\*/, render: m => <strong key={prefix + k++}>{m[1]}</strong> },
      { re: /\[([^\]]+)\]\(([^)]+)\)/, render: m => <a key={prefix + k++} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a> },
    ];
    while (s.length > 0) {
      let best = null, bestIdx = s.length;
      for (const p of patterns) {
        const m = p.re.exec(s);
        if (m && m.index < bestIdx) { best = { m, render: p.render }; bestIdx = m.index; }
      }
      if (!best) { parts.push(s); break; }
      if (bestIdx > 0) parts.push(s.slice(0, bestIdx));
      parts.push(best.render(best.m));
      s = s.slice(bestIdx + best.m[0].length);
    }
    return parts;
  };

  const blocks = [];
  const lines = children.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const fence = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { fence.push(lines[i]); i++; }
      i++;
      blocks.push(<pre key={i}><code>{fence.join('\n')}</code></pre>);
    } else if (line.startsWith('### ')) {
      blocks.push(<h3 key={i}>{parseInline(line.slice(4), `h${i}`)}</h3>); i++;
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={i}>{parseInline(line.slice(3), `h${i}`)}</h2>); i++;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) { items.push(lines[i].slice(2)); i++; }
      blocks.push(<ul key={i}>{items.map((it, j) => <li key={j}>{parseInline(it, `li${i}${j}`)}</li>)}</ul>);
    } else if (line.trim() === '') {
      i++;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('## ') && !lines[i].startsWith('### ') && !lines[i].startsWith('- ') && !lines[i].startsWith('* ') && !lines[i].trim().startsWith('```')) {
        para.push(lines[i]); i++;
      }
      if (para.length > 0) blocks.push(<p key={i}>{parseInline(para.join(' '), `p${i}`)}</p>);
    }
  }

  return <div className="explain-md">{blocks}</div>;
}

// ─── API KEY SETUP PANEL ──────────────────────────────────────────────────
function ApiKeySetup({ onSave, onCancel }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");

  const save = () => {
    const k = draft.trim();
    if (!k.startsWith("sk-ant-")) { setErr("Keys start with sk-ant- — check for typos or extra spaces."); return; }
    localStorage.setItem("pyrate_api_key", k);
    onSave(k);
  };

  return (
    <div style={{ border: "1px solid rgba(120,90,60,0.2)", borderRadius: 12, background: "rgba(12,10,8,0.8)", padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#c8baa4", fontFamily: "'Source Serif 4',Georgia,serif" }}>Connect to Claude AI</span>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#5a4e3a", cursor: "pointer", fontSize: 15 }}>✕</button>}
      </div>

      {/* -- What is an API key */}
      <div style={{ fontSize: 13, lineHeight: 1.7, color: "#907a60", marginBottom: 16 }}>
        <p style={{ margin: "0 0 10px" }}>An <strong style={{ color: "#a89878" }}>API key</strong> lets this tool talk to Claude AI so you can ask follow-up questions in plain English. Without one, you can still use all the built-in explanations and generate commands — the AI chat is optional.</p>
        <p style={{ margin: 0 }}>Your key is stored only in your browser and never sent anywhere except Anthropic's servers.</p>
      </div>

      {/* -- Cost info */}
      <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(120,90,60,0.04)", border: "1px solid rgba(120,90,60,0.1)", marginBottom: 16, fontSize: 12.5, color: "#7a6e58", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, color: "#907a60", marginBottom: 4 }}>Cost</div>
        Pay-as-you-go — no subscription needed. Typical questions here cost <strong style={{ color: "#a89878" }}>less than $0.01 each</strong> (roughly $3 per million words sent to Claude, $15 per million words back). A full session of 20 questions would cost around $0.10–0.30.
      </div>

      {/* -- How to get a key */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#907a60", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>How to get a key</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#7a6e58", lineHeight: 1.9 }}>
          <li>Go to <strong style={{ color: "#a89878" }}>console.anthropic.com</strong> and create a free account</li>
          <li>Click <strong style={{ color: "#a89878" }}>API Keys</strong> in the left sidebar</li>
          <li>Click <strong style={{ color: "#a89878" }}>Create Key</strong>, give it any name</li>
          <li>Copy the key (it starts with <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "#8a9898" }}>sk-ant-</code>) and paste it below</li>
          <li>Add a credit card to activate the key</li>
        </ol>
      </div>

      {/* -- Key input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={draft}
          onChange={e => { setDraft(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && save()}
          placeholder="sk-ant-api03-..."
          style={{ flex: 1, background: "rgba(120,90,60,0.05)", border: `1px solid ${err ? "rgba(180,80,60,0.4)" : "rgba(120,90,60,0.2)"}`, borderRadius: 8, padding: "9px 12px", color: "#c0b098", fontSize: 13, fontFamily: "'JetBrains Mono',monospace", outline: "none" }}
        />
        <button onClick={save} style={{ background: "rgba(120,90,60,0.15)", border: "1px solid rgba(120,90,60,0.25)", borderRadius: 8, padding: "9px 16px", color: "#b09070", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Save key</button>
      </div>
      {err && <div style={{ marginTop: 7, fontSize: 12, color: "rgba(200,100,80,0.8)" }}>{err}</div>}
    </div>
  );
}

// ─── DEEP DIVE CHAT ──────────────────────────────────────────────────────
function Chat({ topic, allTags, choices, apiKey, setApiKey }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [notes, setNotes] = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);

  // -- Load notes from static files once when chat opens
  useEffect(() => {
    if (!open || notes || notesLoading) return;
    setNotesLoading(true);
    Promise.all([
      fetch("notes_tutorials.html").then(r => r.text()),
      fetch("notes_concepts.html").then(r => r.text())
    ])
      .then(([t, c]) => { setNotes(t + "\n\n" + c); setNotesLoading(false); })
      .catch(() => { setNotes(""); setNotesLoading(false); });
  }, [open]);

  const ask = async () => {
    if (!input.trim() || loading || notesLoading) return;
    const q = input.trim();
    setInput("");
    const updatedMsgs = [...msgs, { role: "user", text: q }];
    setMsgs(updatedMsgs);
    setLoading(true);
    try {
      const ctx = choices.length > 0 ? `\nThe user's current path through the wizard: ${choices.map(c => c.choice).join(" → ")}` : "";
      const systemText = `You are an expert PyRate assistant for biologists and paleontologists. Answer questions based on the notes below, which are the authoritative source. Explain in evolutionary biology terms first, then give technical PyRate details. Warn about silent failure modes and pitfalls. Be concise but complete.

Formatting note: bold and headings indicate structure and emphasis. Color hints in the HTML are mostly accurate but may be inconsistent — ground your understanding in the text content itself.${ctx}

PYRATE NOTES:
${notes || ""}`;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          system: systemText,
          messages: updatedMsgs.map(m => ({ role: m.role, content: m.text }))
        })
      });
      const d = await r.json();
      if (d.error) {
        const msg = d.error.type === "authentication_error"
          ? "Invalid API key. Click the 🔑 icon above to update it."
          : `API error: ${d.error.message}`;
        setMsgs(p => [...p, { role: "assistant", text: msg }]);
      } else {
        setMsgs(p => [...p, { role: "assistant", text: d.content?.map(b => b.text || "").join("") || "Sorry, couldn't generate a response." }]);
      }
    } catch {
      setMsgs(p => [...p, { role: "assistant", text: "Couldn't connect to the API. Check your internet connection or try again." }]);
    }
    setLoading(false);
  };

  // -- Collapsed button
  if (!open) return (
    <button onClick={() => { setOpen(true); if (!apiKey) setShowKeySetup(true); }} style={{
      background: "none", border: "1px solid rgba(120,90,60,0.15)", borderRadius: 10,
      padding: "10px 18px", color: "#806a50", cursor: "pointer", fontSize: 13,
      fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center"
    }}>💬 Have a question? Ask Claude for more detail</button>
  );

  // -- Key setup screen
  if (showKeySetup) return (
    <ApiKeySetup
      onSave={k => { setApiKey(k); setShowKeySetup(false); }}
      onCancel={() => { setOpen(false); setShowKeySetup(false); }}
    />
  );

  // -- Chat panel
  return (
    <div style={{ border: "1px solid rgba(120,90,60,0.15)", borderRadius: 12, overflow: "hidden", background: "rgba(12,10,8,0.6)" }}>
      <div style={{ padding: "10px 16px", background: "rgba(120,90,60,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(120,90,60,0.08)" }}>
        <span style={{ fontSize: 13, color: "#907a60", fontFamily: "'DM Sans',sans-serif" }}>💬 Ask Claude</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowKeySetup(true)} title="Change API key" style={{ background: "none", border: "none", color: "#5a4e3a", cursor: "pointer", fontSize: 12 }}>🔑</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#5a4e3a", cursor: "pointer", fontSize: 15 }}>✕</button>
        </div>
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto", padding: 14 }}>
        {msgs.length === 0 && <p style={{ color: "#5a4e3a", fontSize: 13, fontStyle: "italic", margin: 0 }}>Ask anything — "why does this matter?" or "what if I have lots of singletons?"</p>}
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 10, padding: "10px 14px", borderRadius: 10, background: m.role === "user" ? "rgba(120,90,60,0.08)" : "rgba(80,100,120,0.06)", fontSize: 13, lineHeight: 1.6, color: "#c0b098", borderLeft: m.role === "assistant" ? "3px solid rgba(100,120,140,0.25)" : "none" }}>{m.text}</div>
        ))}
        {notesLoading && <div style={{ color: "#5a4e3a", fontSize: 13, fontStyle: "italic" }}>Loading notes...</div>}
        {loading && <div style={{ color: "#5a4e3a", fontSize: 13, fontStyle: "italic" }}>Thinking...</div>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid rgba(120,90,60,0.08)" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} placeholder="Type your question..." style={{ flex: 1, background: "rgba(120,90,60,0.05)", border: "1px solid rgba(120,90,60,0.12)", borderRadius: 8, padding: "8px 12px", color: "#c0b098", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
        <button onClick={ask} disabled={loading || notesLoading} style={{ background: "rgba(120,90,60,0.12)", border: "1px solid rgba(120,90,60,0.2)", borderRadius: 8, padding: "8px 14px", color: "#907a60", cursor: "pointer", fontSize: 13 }}>Send</button>
      </div>
    </div>
  );
}

// ─── COMMAND BUILDER ──────────────────────────────────────────────────────
function CmdBuilder({ tags, choices, apiKey }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const build = async () => {
    setLoading(true);
    // Try API first, fall back to deterministic
    try {
      if (!apiKey) throw new Error("no key");
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1500,
          system: `You are a PyRate command builder. Generate EXACT terminal commands with # comments explaining each flag in plain English. Use placeholder paths like path/to/your_file.py.

CRITICAL RULES:
- -fixShift with -A 4 → silently becomes -A 0
- -r forces -A 0 silently
- BDNN always -A 0
- Always -mG for DES
- -ginput only from non-RJMCMC logs
- BDNN small networks: increase -BDNNupdate_f
- -translate for extinct BDNN clades
- -BDNN_nsim_expected_cv 0 for extinct
- -combLog without -tag causes errors
- Old combined files must be removed first

Format: command with comments, ⚠️ warnings, 📋 next steps. SLURM: full sbatch script.`,
          messages: [{ role: "user", content: `Build for: ${JSON.stringify(choices.map(c => c.choice))}\nTags: ${tags.join(", ")}` }]
        })
      });
      const d = await r.json();
      const txt = d.content?.map(b => b.text || "").join("");
      if (txt && txt.length > 50) { setResult(txt); setLoading(false); return; }
    } catch {}
    // Deterministic fallback
    setResult(fallback(tags));
    setLoading(false);
  };

  const fallback = (t) => {
    let L = [];
    const isSlurm = t.some(x => x.startsWith("slurm"));
    if (isSlurm) {
      L.push("#!/bin/bash");
      L.push("#SBATCH --job-name=pyrate_run");
      L.push("#SBATCH --output=pyrate_%A_%a.out");
      L.push("#SBATCH --error=pyrate_%A_%a.err");
      L.push("#SBATCH --array=1-10        # One job per replicate — change 10 to your number of replicates");
      L.push(t.includes("slurm_bdnn") ? "#SBATCH --time=96:00:00      # BDNN needs more time" : "#SBATCH --time=48:00:00");
      L.push(t.includes("slurm_bdnn") ? "#SBATCH --mem=16G            # BDNN needs more memory" : "#SBATCH --mem=8G");
      L.push("#SBATCH --cpus-per-task=1"); L.push(""); L.push("module load python/3.x  # ← Change to match your cluster's module name"); L.push("");
    }
    const jflag = isSlurm ? "$SLURM_ARRAY_TASK_ID" : "1";
    const mcmc = t.includes("n50m_s10k") ? "-n 50000000 -s 10000" : t.includes("n1m_s1k") ? "-n 1000000 -s 1000" : "-n 20000000 -s 5000";

    if (t.includes("ginput")) {
      L.push("# Extract estimated speciation/extinction times from a previous PyRate run");
      L.push("# ⚠️ Only works with basic parameter estimation output — NOT with RJMCMC!");
      L.push("python PyRate.py -ginput path/to/*_mcmc.log -b 200");
      L.push("# Output: *_se_est.txt — use this as input for PyRateContinuous or MBD");
    } else if (t.includes("mprob")) {
      L.push("# Check which number of rate shifts has the best support");
      L.push("python PyRate.py -mProb path/to/*_mcmc.log -b 200");
      L.push("# Output: table showing probability of 0, 1, 2, 3... shifts for speciation and extinction");
    } else if (t.includes("combrj")) {
      L.push("# ⚠️ First: move any previously-combined files OUT of this directory!");
      L.push("# Combine replicate outputs (works for RJMCMC, MCMC, and most analysis types)");
      L.push("python PyRate.py -combLogRJ path/to/pyrate_mcmc_logs/ -b 200 -tag YourDatasetName");
    } else if (t.includes("combbdnn")) {
      L.push("# ⚠️ First: move any previously-combined files OUT of this directory!");
      L.push("python PyRate.py -combBDNN path/to/pyrate_mcmc_logs/ -b 20 -resample 100 -tag YourDatasetName");
    } else if (t.includes("plotrj")) {
      L.push("# Plot rates through time (automatic shift detection results)");
      L.push("python PyRate.py -plotRJ path/to/pyrate_mcmc_logs/ -b 200 -tag YourDatasetName");
      L.push("# Optional: -root_plot 66 -min_age_plot 0    # Limit time range shown");
      L.push("# Optional: -grid_plot 0.5                    # Change time resolution");
    } else if (t.includes("plot_marginal")) {
      L.push("python PyRate.py -plot path/to/*_marginal_rates.log -b 200");
    } else if (t.includes("plotbdnn") || t.includes("bdnn_rtt")) {
      L.push("python PyRate.py -plotBDNN path/to/*_mcmc.log -b 0.1");
    } else if (t.includes("bdnn_pdp")) {
      L.push("python PyRate.py -plotBDNN_effects path/to/*_mcmc.log \\");
      L.push("  -plotBDNN_transf_features path/to/Backscale.txt \\");
      L.push("  -b 0.1 -resample 100");
    } else if (t.includes("bdnn_pred")) {
      L.push("python PyRate.py -BDNN_pred_importance path/to/*_mcmc.log -b 0.1" + (t.includes("bdnn_pred_extinct") ? " \\\n  -BDNN_nsim_expected_cv 0  # Required for extinct groups" : ""));
    } else if (t.includes("bdnn_interaction")) {
      L.push("python PyRate.py -BDNN_interaction path/to/*_mcmc.log \\");
      L.push("  -plotBDNN_transf_features path/to/Backscale.txt -b 0.5 -resample 3");
    } else if (t.includes("plot_continuous")) {
      L.push("python PyRateContinuous.py -d path/to/*_se_est.txt \\");
      L.push("  -plot path/to/*_mcmc.log -b 100");
    } else if (t.includes("bdnn")) {
      L.push("python PyRate.py path/to/*_PyRate.py \\");
      L.push("  -BDNNmodel 1 \\                         # Neural network for speciation + extinction");
      if (t.includes("bdnn_traits") || t.includes("bdnn_both")) L.push("  -trait_file path/to/Traits.txt \\         # Species-specific traits (z-transformed!)");
      if (t.includes("bdnn_timevar") || t.includes("bdnn_both")) L.push("  -BDNNtimevar path/to/Predictors.txt \\    # Time-varying environmental predictors (z-transformed!)");
      L.push("  -fixShift path/to/Time_windows.txt \\    # Speeds up BDNN significantly");
      L.push("  -qShift path/to/Stages.txt -mG \\        # Preservation: time-binned + lineage variation");
      if (t.includes("extinct_translate")) L.push("  -translate -X.X \\                        # ← Replace X.X with your time shift value");
      if (t.includes("bdnn_small_net")) { L.push("  -BDNNnodes 4 2 \\                        # Smaller network for few predictors"); L.push("  -BDNNupdate_f 0.3 \\                     # ⚠️ CRITICAL: must increase for small networks!"); }
      L.push(`  ${mcmc} -p 10000 -j ${jflag}`);
    } else if (t.includes("des")) {
      L.push("python PyRateDES.py -d path/to/DES_input_1.txt \\");
      if (t.includes("des_skyline")) { L.push("  -TdD -TdE \\                              # Time-dependent dispersal and extinction"); L.push("  -qtimes 20.43 15.97 13.65 \\              # ← Replace with your time boundaries"); }
      if (t.includes("des_covar")) L.push("  -varD path/to/dispersal_covariates/ \\    # Environmental predictors for dispersal\n  -varE path/to/extinction_covariates/ \\   # Environmental predictors for extinction");
      if (t.includes("des_divd")) L.push("  -DivdD -DivdE \\                         # Diversity-dependent dispersal and extinction");
      if (t.includes("des_mg")) L.push("  -mG \\                                    # Lineage-specific preservation variation (recommended)");
      L.push("  -n 1000000 -s 1000 -p 1000");
    } else if (t.includes("dd")) {
      L.push("# Step 1: Extract ts/te from a previous basic PyRate run");
      L.push("python PyRate.py -ginput path/to/*_mcmc.log -b 200\n");
      L.push("# Step 2: Run diversity-dependence model");
      let m = t.includes("dd_exp") ? "-m 0  # Exponential" : t.includes("dd_lin") ? "-m 1  # Linear" : "-m 0  # Run separately with -m 0, -m 1, and -m -1 to compare";
      L.push(`python PyRateContinuous.py -d path/to/*_se_est.txt -DD ${m} \\`);
      L.push("  -n 1000000 -s 1000");
    } else if (t.includes("env_single")) {
      L.push("python PyRateContinuous.py -d path/to/*_se_est.txt \\");
      L.push("  -c path/to/environment_variable.txt \\   # Your environmental predictor file");
      if (t.includes("env_exp")) L.push("  -m 0 \\                                  # Exponential relationship");
      else if (t.includes("env_lin")) L.push("  -m 1 \\                                  # Linear relationship");
      if (t.includes("env_ti_compare")) L.push("  -A 1 \\                                  # Thermodynamic integration for model comparison");
      L.push("  -n 1000000 -s 1000");
    } else if (t.includes("mbd")) {
      L.push("python PyRateMBD.py -d path/to/*_se_est.txt \\");
      L.push("  -var path/to/predictors_directory/ \\     # Directory containing all predictor .txt files");
      L.push("  -m 1" + (t.includes("mbd_gamma") ? " -hsp 0  # Gamma hyper-priors" : "  # Linear model with horseshoe prior (automatic variable selection)") + " \\");
      L.push("  -n 1000000 -s 1000");
    } else if (t.includes("covar")) {
      L.push("python PyRate.py path/to/*_PyRate.py \\");
      L.push("  -trait_file path/to/traits.txt \\         # File with Species and Trait columns");
      const mc = t.includes("mcov1") ? "1  # Speciation only" : t.includes("mcov2") ? "2  # Extinction only" : t.includes("mcov3") ? "3  # Speciation + extinction" : "5  # All three rates";
      L.push(`  -mCov ${mc} \\`);
      if (t.includes("mcov3") || t.includes("mcov5")) L.push("  -pC 0 \\                                 # Estimate correlation prior from data (recommended for 2+ params)");
      L.push("  -logT 1 \\                               # Log-transform the trait");
      if (t.includes("gamma")) L.push("  -mG \\                                    # Lineage-specific preservation variation");
      L.push(`  ${mcmc} -p 1000 -j ${jflag}`);
    } else if (t.includes("ade")) {
      L.push("python PyRate.py path/to/*_PyRate.py \\");
      L.push("  -ADE 1 \\                                # Age-dependent extinction model");
      if (t.includes("ade_tpp")) L.push("  -qShift path/to/epochs.txt \\            # Time-binned preservation (required for ADE)");
      else L.push("  -mHPP \\                                 # Constant preservation (required for ADE)");
      L.push(`  ${mcmc} -j ${jflag}`);
    } else {
      if (t.includes("ppmodeltest")) { L.push("# Step 1: Test which preservation model fits your data best"); L.push("python PyRate.py path/to/*_PyRate.py -qShift path/to/epochs.txt -PPmodeltest"); L.push("# → Use the winning model's flags in Step 2\n"); L.push("# Step 2: Run the main analysis with the best preservation model:"); }
      L.push("python PyRate.py path/to/*_PyRate.py \\");
      if (t.includes("rjmcmc")) L.push("  # Automatic rate-shift detection (RJMCMC) is the default — no flag needed \\");
      if (t.includes("constant_rates")) L.push("  -A 0 \\                                  # Constant rates (basic parameter estimation) \\");
      if (t.includes("fixshift_confirmed")) L.push("  -fixShift path/to/shift_times.txt \\     # ⚠️ This turns off automatic shift detection! \\");
      if (t.includes("edgeshift_both") || t.includes("edgeshift_max")) L.push("  -edgeShift MAX_AGE MIN_AGE \\             # ← Replace with your boundary ages \\");
      if (t.includes("hpp")) L.push("  -mHPP \\                                 # Constant preservation rate \\");
      if (t.includes("tpp")) L.push("  -qShift path/to/epochs_q.txt \\          # Time-binned preservation \\");
      if (t.includes("gamma")) L.push("  -mG \\                                    # Different preservation rates per lineage \\");
      if (t.includes("gibbs")) L.push("  -se_gibbs -fU 0.02 0.18 0.08 \\         # Faster algorithm for large datasets \\");
      L.push(`  ${mcmc} -p 1000 -j ${jflag}`);
    }
    L.push(""); L.push("# ─── NEXT STEPS ───");
    L.push("# 1. Replace all path/to/ placeholders with your actual file paths");
    L.push("# 2. After the run finishes, open *_mcmc.log in Tracer");
    L.push("# 3. Check that ESS ≥ 200 for all parameters — if not, increase -n and re-run");
    return L.join("\n");
  };

  return (
    <div>
      <button onClick={build} disabled={loading} style={{
        background: "linear-gradient(135deg, #b08a5a, #8a6a40)", border: "none", borderRadius: 12,
        padding: "16px 28px", color: "#1a1612", cursor: loading ? "wait" : "pointer",
        fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 700,
        boxShadow: "0 4px 24px rgba(160,120,70,0.2)", width: "100%"
      }}>{loading ? "⏳ Building..." : "⚡ Generate My PyRate Command"}</button>
      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ background: "rgba(8,7,5,0.9)", borderRadius: 14, padding: 22, border: "1px solid rgba(120,90,60,0.15)", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "#5a4e3a", textTransform: "uppercase", letterSpacing: "0.08em" }}>Your Command</span>
              <button onClick={() => navigator.clipboard?.writeText(result)} style={{ background: "rgba(120,90,60,0.12)", border: "1px solid rgba(120,90,60,0.2)", borderRadius: 6, padding: "4px 12px", color: "#907a60", cursor: "pointer", fontSize: 12 }}>📋 Copy</button>
            </div>
            <pre style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, lineHeight: 1.75, color: "#d0c4b0", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{result}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────
export default function PyRateWizard() {
  const [cur, setCur] = useState("start");
  const [hist, setHist] = useState([]);
  const [tags, setTags] = useState([]);
  const [choices, setChoices] = useState([]);
  const [showTech, setShowTech] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("pyrate_api_key") || "");

  const node = TREE[cur];
  const td = KB[node.topic];

  const pick = (o) => {
    setHist(p => [...p, { id: cur, label: o.label, tags: o.tags }]);
    setTags(p => [...p, ...o.tags]);
    setChoices(p => [...p, { step: node.question, choice: o.label }]);
    setCur(o.next);
    setShowTech(false);
  };
  const back = () => {
    if (!hist.length) return;
    const last = hist[hist.length - 1];
    setHist(h => h.slice(0, -1));
    setChoices(c => c.slice(0, -1));
    setTags(t => t.slice(0, t.length - last.tags.length));
    setCur(last.id);
    setShowTech(false);
  };
  const reset = () => { setCur("start"); setHist([]); setTags([]); setChoices([]); setShowTech(false); };

  return (
    <div style={{ minHeight: "100vh", background: "#151210", color: "#d8ccb8", fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @keyframes fu { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes sr { from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)} }
        .ob:hover{background:rgba(120,90,60,0.1)!important;border-color:rgba(120,90,60,0.35)!important}
        .ob{transition:all .2s ease!important}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(120,90,60,0.18);border-radius:3px}
        .explain-md p{margin:0 0 9px;line-height:1.7}
        .explain-md h2{font-family:'Source Serif 4',Georgia,serif;font-size:14px;font-weight:600;color:#c8baa4;margin:14px 0 5px;letter-spacing:-0.01em}
        .explain-md h3{font-family:'Source Serif 4',Georgia,serif;font-size:13px;font-weight:600;color:#b8a894;margin:12px 0 4px}
        .explain-md ul{padding-left:18px;margin:4px 0 10px}
        .explain-md li{margin-bottom:4px;line-height:1.65}
        .explain-md code{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#7a98a8;background:rgba(70,90,110,0.14);padding:1px 5px;border-radius:4px}
        .explain-md pre{background:rgba(8,7,5,0.85);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:8px 0 12px;border-left:3px solid rgba(70,90,110,0.25)}
        .explain-md pre code{background:none;padding:0;color:#a8bccc;font-size:12px;line-height:1.65}
        .explain-md a{color:#8a98a8;text-decoration:underline;text-decoration-color:rgba(138,152,168,0.4)}
        .explain-md a:hover{color:#a8bccc}
        .explain-md strong{color:#c0b098;font-weight:600}
      `}</style>
      {/* Header */}
      <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid rgba(120,90,60,0.08)", background: "rgba(20,17,14,0.95)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "#ddd0c0", fontFamily: "'Source Serif 4',Georgia,serif" }}>🦴 PyRate Wizard</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#5a4e3a" }}>Guided setup for fossil diversification analysis</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {hist.length > 0 && <button onClick={back} style={{ background: "rgba(120,90,60,0.06)", border: "1px solid rgba(120,90,60,0.15)", borderRadius: 7, padding: "6px 13px", color: "#907a60", cursor: "pointer", fontSize: 13 }}>← Back</button>}
            {hist.length > 1 && <button onClick={reset} style={{ background: "none", border: "1px solid rgba(120,90,60,0.1)", borderRadius: 7, padding: "6px 13px", color: "#4a4030", cursor: "pointer", fontSize: 13 }}>Start over</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2, borderRadius: 1, background: i < hist.length ? "rgba(170,130,80,0.55)" : "rgba(120,90,60,0.08)", transition: "background .4s" }} />
          ))}
        </div>
      </div>
      {/* Breadcrumb */}
      {choices.length > 0 && (
        <div style={{ padding: "9px 24px", borderBottom: "1px solid rgba(120,90,60,0.05)", overflowX: "auto", whiteSpace: "nowrap" }}>
          {choices.map((c, i) => <span key={i} style={{ fontSize: 11.5, color: "#5a4e3a" }}>{c.choice}{i < choices.length - 1 && <span style={{ margin: "0 5px", opacity: .3 }}>›</span>}</span>)}
        </div>
      )}
      {/* Content */}
      <div style={{ padding: "26px 24px 44px", maxWidth: 660, margin: "0 auto", animation: "fu .3s ease" }} key={cur}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 5px", color: "#ddd0c0", lineHeight: 1.35, fontFamily: "'Source Serif 4',Georgia,serif" }}>{node.question}</h2>
        {node.subtitle && <p style={{ fontSize: 13.5, color: "#7a6e58", margin: "0 0 18px", lineHeight: 1.55 }}>{node.subtitle}</p>}
        {/* Explanation */}
        {node.explain && (
          <div style={{ padding: "14px 16px", marginBottom: 18, background: "rgba(120,90,60,0.04)", borderRadius: 11, borderLeft: "3px solid rgba(160,120,70,0.25)", fontSize: 13.5, lineHeight: 1.7, color: "#a89878" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ fontSize: 13 }}>💡</span>
              <span style={{ fontWeight: 600, fontSize: 11, color: "#907a60", textTransform: "uppercase", letterSpacing: ".05em" }}>What you should know</span>
            </div>
            <MiniMarkdown>{node.explain}</MiniMarkdown>
          </div>
        )}
        {/* Tech toggle */}
        {td && (
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowTech(!showTech)} style={{ background: "none", border: "1px solid rgba(80,100,120,0.15)", borderRadius: 7, padding: "6px 13px", color: "#6a8898", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11 }}>{showTech ? "▾" : "▸"}</span>{showTech ? "Hide" : "Show"} technical details & flags
            </button>
            {showTech && <pre style={{ marginTop: 8, padding: 14, background: "rgba(70,90,110,0.04)", borderRadius: 9, borderLeft: "3px solid rgba(70,90,110,0.18)", fontSize: 12, lineHeight: 1.6, color: "#7a98a8", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto" }}>{td.technical}</pre>}
          </div>
        )}
        {/* Chat */}
        <div style={{ marginBottom: 22 }}><Chat topic={node.topic} allTags={tags} choices={choices} apiKey={apiKey} setApiKey={setApiKey} /></div>
        {/* Options or Builder */}
        {node.terminal ? <CmdBuilder tags={tags} choices={choices} apiKey={apiKey} /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {node.options.map((o, i) => (
              <button key={i} className="ob" onClick={() => pick(o)} style={{
                background: "rgba(120,90,60,0.03)", border: "1px solid rgba(120,90,60,0.1)", borderRadius: 11,
                padding: "14px 16px", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "flex-start", gap: 12, animation: `sr .25s ease ${i * .04}s both`
              }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{o.icon || "→"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: "#c8baa4", lineHeight: 1.5 }}>{o.label}</div>
                  {o.hint && <div style={{ fontSize: 12, color: "#5e5240", marginTop: 3, lineHeight: 1.35 }}>{o.hint}</div>}
                </div>
                <span style={{ color: "#3a3428", fontSize: 15, marginTop: 2, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
