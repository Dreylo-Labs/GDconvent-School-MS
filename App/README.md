# G.D. Convent Parent & Student App

React + TypeScript mobile web application designed for Capacitor packaging.

```bash
npm install
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:4000`. For a native build, set `VITE_API_URL` to the public HTTPS backend URL and run `npm run cap:sync`.

## Source structure

```text
src/
├── components/
│   ├── auth/       Route access control
│   ├── feedback/   Loading and empty states
│   ├── layout/     Shared app shell and navigation
│   └── ui/         Reusable presentational components
├── context/        Authentication and selected-child state
├── pages/          One module per routed screen
├── types/          Shared domain and API types
├── utils/          Formatting and display helpers
├── api.ts          HTTP client and token handling
├── App.tsx         Lazy route configuration only
└── main.tsx        Application bootstrap
```

Pages are lazy-loaded, so adding a screen does not increase the initial application bundle unless the user opens that screen.
