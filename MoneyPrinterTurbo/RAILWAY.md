# MoneyPrinterTurbo API on Railway

Create a Railway service from this repository and set its Root Directory to
`MoneyPrinterTurbo`. Railway will use `railway.json` and `Dockerfile.api`.

Required variables for the default Pexels + Gemini setup:

```text
MPT_LLM_PROVIDER=gemini
MPT_GEMINI_API_KEY=...
MPT_PEXELS_API_KEY=...
CORS_ALLOWED_ORIGINS=https://moneyprinter-turbo-tavi-esports1.vercel.app
MPT_PUBLIC_BASE_URL=https://YOUR-SERVICE.up.railway.app
```

Alternative OpenAI-compatible setup:

```text
MPT_LLM_PROVIDER=openai
MPT_OPENAI_API_KEY=...
MPT_OPENAI_MODEL_NAME=gpt-4.1-mini
```

Attach a persistent volume at `/MoneyPrinterTurbo/storage` so generated videos
survive restarts. After Railway reports `/health` as healthy, set the Vercel
frontend variable:

```text
NEXT_PUBLIC_MPT_API_URL=https://YOUR-SERVICE.up.railway.app
```

Do not commit API keys to `config.toml` or to the repository.
