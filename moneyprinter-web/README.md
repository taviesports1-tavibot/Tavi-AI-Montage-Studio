# MoneyPrinter standalone web

Independent Next.js frontend for the bundled MoneyPrinterTurbo backend.

## Vercel

Create a separate Vercel project from this GitHub repository and set Root Directory to `moneyprinter-web`.

Add environment variable:

`NEXT_PUBLIC_MPT_API_URL=https://YOUR-MONEYPRINTER-BACKEND`

The backend must expose MoneyPrinterTurbo routes including:

- `POST /api/v1/videos`
- `GET /api/v1/tasks/{task_id}`

The frontend belongs on Vercel. Long-running Python/FFmpeg rendering should run on Railway/VPS/container hosting rather than inside the Vercel frontend deployment.
