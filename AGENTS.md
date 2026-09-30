<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep synthetic city generation and corridor algorithms in `src/lib/corridor-simulation.ts`, separate from React views, so real geospatial inputs can replace the demo grid later.
- Render all map views through one shared canvas component so the main map, playground, and comparison use identical visual encoding.
