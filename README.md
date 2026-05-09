# SimplexAI

Application Next.js pour résoudre des problèmes de programmation linéaire avec la méthode du simplexe, visualisation des tableaux, analyse de sensibilité, dual, graphe 2D et analyse IA.

## Installation

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000), puis aller sur `/solver`.

## Variables d'environnement

Créer un fichier `.env.local` à partir de `.env.example`:

```env
AI_PROVIDER=openai
AI_MODEL=gpt-4o
AI_API_KEY=your_api_key_here
AI_BASE_URL=https://api.openai.com/v1
```

Exemples:

```env
AI_PROVIDER=groq
AI_MODEL=llama-3.3-70b-versatile
AI_API_KEY=your_groq_key
AI_BASE_URL=https://api.groq.com/openai/v1
```

```env
AI_PROVIDER=anthropic
AI_MODEL=claude-3-5-sonnet-latest
AI_API_KEY=your_anthropic_key
AI_BASE_URL=https://api.anthropic.com
```

`AI_API_KEY` reste côté serveur dans `app/api/analyze/route.ts` et n'est jamais exposée au client.

## Scripts

```bash
npm run lint
npm run build
```

## Bibliothèques principales

- Tailwind CSS pour l'interface
- Framer Motion pour les transitions
- KaTeX + react-katex pour les formulations mathématiques
- Recharts pour les graphiques de sensibilité
- Lucide React pour les icônes
- React Markdown pour le rendu de l'analyse IA
- jsPDF pour l'export PDF
