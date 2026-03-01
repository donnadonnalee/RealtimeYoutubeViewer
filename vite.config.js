import { defineConfig } from 'vite';

export default defineConfig({
    base: '/RealtimeYoutubeViewer/', // Set base path for standalone GitHub Pages deployment
    server: {
        host: true // Enable LAN access for testing
    }
});
