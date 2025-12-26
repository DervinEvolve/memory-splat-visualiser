# Memory Splat Visualiser

**Work in progress side project - not yet complete.**

A web application that transforms your photos into 3D Gaussian splats, allowing you to explore your memories in latent space.

## Status

Currently exploring the trade-offs between point cloud rendering vs full Gaussian splat visualization for viewing memories. The goal is to create an experience similar to floating through a gallery of 3D memories.

## Features (In Progress)

- Upload photos and convert them to 3D Gaussian splats via Sharp API
- Browse photos as floating cards in 3D space
- Tap a card to view its full 3D splat
- Navigate between splats with swipe gestures
- Drag and scroll to explore the memory space

## Tech Stack

- Three.js for 3D rendering
- @mkkellogg/gaussian-splats-3d for splat visualization
- Modal for GPU-accelerated splat generation
- Supabase for storage
- Vite + TypeScript

## Development

```bash
npm install
npm run dev
```

## License

MIT
