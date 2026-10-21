<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:design-agent-rules -->
# Never use custom tailwind class values, use official one
# all the Shadcn copoent. have inbuilt color scheme so u dont have to add that in the custome components and if u wanna use it use it from global.css variables
# all the margin padding spacing should be from the parent components not in the child itself
# Dont create a core component use Component from shadcn as much as possible, and the custom component should be the cimbination if shadcn component if particualar component does not exist down from shadcn cli
# All the custom component should be moduler in nature do not make one bug component, all the custom componen t should be modular in m nature
# in the custom component if u wanna use colors use the colors from `global.css` file

<!-- END:design-agent-rules -->

<!-- BEGIN:data-agent-rules -->
# Data fetching and validation: use SWR only — no `useEffect` fetching, no react-query, no hand-rolled loading state
# Fetchers: use axios, and every fetcher must be a named function in `lib/fetchers.ts` (never an inline fetcher inside a component)
# Types: all shared types live in `lib/types.ts`; prefer `type` over `interface`, use `interface` only when it is genuinely needed
# Helpers: all custom helper functions live in `lib/utils.ts`; keep them simple and easy to follow even if a function grows long
# API routes: use Next.js Route Handlers in `app/api/<resource>/route.ts` (never `pages/api`)
# Validation: validate and normalise response data in the fetcher/SWR layer, not inside components
<!-- END:data-agent-rules -->