# OpenMNK

![OpenMNK Banner](assets/banner.png)

A desktop AI agent that operates your computer. You talk, it does.

## Quick start

```bash
git clone git@github.com:Emericen/openmnk.git
cd openmnk
npm install
cp .env.example .env   # fill in LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
npm run dev
```

## What it does

OpenMNK is a macOS desktop app that lets you control your computer through natural language. Ask it to read files, edit documents, run shell commands, or automate browser tasks — it executes directly on your machine.

## API Keys

OpenMNK is BYOK (bring your own key). Add your API credentials to `.env`:

- `LLM_BASE_URL` — your LLM provider endpoint
- `LLM_API_KEY` — your API key
- `LLM_MODEL` — model name (e.g. `gpt-4o`)

Optional: add `TRANSCRIBE_BASE_URL` and `TRANSCRIBE_API_KEY` to enable voice dictation.

## Stack

- Electron + Vite + React + TypeScript
- assistant-ui for chat interface
- OpenAI-compatible LLM API
- Shell execution via Node.js spawn
