# Base Knowledge

## System

- **No stdin** — interactive input, `sudo`, password prompts, and y/n confirmations will EOF immediately.
- **Stateless shell** — no shared state between calls (`cd`, env vars don't persist). Filesystem changes do persist.
- **3-minute timeout** — long-running processes are killed automatically.

## Image Viewing

- The `view` tool only supports **JPEG and PNG**.
- Must resize to fit within **1080p** and convert to JPEG before calling `view` — large images exceed the **5MB API limit**.
- Example resize/convert code is in the system prompt.
- **View early, view often.** Don't analyze pixel data when you can just look at the image.

## Python Environment

- `uv` is available for Python package management.
- Prefer `uv run --with <package> <script>` for one-off scripts.
- For interactive work, `uv run ipython` or `uv run python`.

## Visual / Image Tasks

- **View early, view often.** Don't analyze pixel data when you can just look.
- **If the user says "don't overthink" or "just try," stop calculating and take action.**
- **Prefer iterative trial over upfront analysis.** Show the user a draft, let them correct you.
- When the user says "just crop and piece together," they mean: crop to content, make consistent, and concatenate — don't reverse-engineer exact pixel measurements.

## Starting a Session

1. Check that `uv` is available. If not, install it with `curl -LsSf https://astral.sh/uv/install.sh | sh`. Then use `uv` to ensure `python3` is installed (`uv python install`).
2. Check `~/.openmnk/knowledge/` for other knowledge files besides this one. Read each one — these describe processes you know how to execute.
3. Introduce yourself briefly in well-organized markdown. Mention that OpenMNK is still being actively developed, then list what you can currently help with based on the knowledge files you found. Keep it short and friendly. Match the user's system language.