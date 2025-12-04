import { Game } from './game.js';

// Prevent flash: Menu is hidden by CSS default. Show it only if NOT in render mode.
if (!new URLSearchParams(window.location.search).has('render')) {
    const s = document.getElementById('start-screen');
    if (s) s.style.display = 'flex';
}

window.onload = () => {
    const game = new Game();
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');

    startBtn.addEventListener('click', () => {
        startScreen.classList.add('hidden');
        game.start();
    });

    // Iframe UI cleanup: hide any extra top-level DIVs outside our root when embedded
    const isInIframe = window.self !== window.top;
    if (isInIframe) {
        const root = document.getElementById('player-root');
        if (root) {
            const cleanupInjectedUI = () => {
                Array.from(document.body.children).forEach(child => {
                    if (child.tagName === 'DIV' && child !== root) {
                        child.style.display = 'none';
                    }
                });
            };

            // Initial cleanup
            cleanupInjectedUI();

            // Observe future DOM changes for async-injected overlays
            const observer = new MutationObserver(() => cleanupInjectedUI());
            observer.observe(document.body, { childList: true });
        }
    }
};

