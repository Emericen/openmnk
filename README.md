# OpenMNK

![OpenMNK Banner](assets/banner.png)

Agent that operates your computer with only a terminal.

## Quick Start

```bash
git clone git@github.com:Emericen/openmnk.git
cd openmnk
cp .env.example .env   # add your LLM provider URL, API key, and model name
npm install
npm run dev
```

Optional: add `TRANSCRIBE_BASE_URL` and `TRANSCRIBE_API_KEY` to `.env` for voice dictation.

## How It Works

OpenMNK loads one file into the AI: `knowledge/base.md`. This is the same pattern as Claude Code's `CLAUDE.md` or OpenClaw's `SOUL.md` — a markdown file that tells the agent who it is and how to behave.

From there, the agent does everything else itself. It checks `~/.openmnk/knowledge/` for skill files, reads them, installs any missing dependencies, and introduces itself. No plugin system, no skill registry — just `ls` and `cat`.

Features beyond the core agent ship as separate software. Office Bridge is its own project. Google Workspace CLI is its own project. The agent learns to use them from a skill file that says "here's how to call this via the terminal." The same way you'd hand someone a doc and say "read this, then do the thing."

This is intentional. The terminal is the universal interface. The only software you need to build is the one that connects a human to an AI to a shell. Everything else is just knowledge.
