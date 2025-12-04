import { Game } from './game.js';

// Priority: Check render mode immediately to prevent UI flash
if (new URLSearchParams(window.location.search).get('render')) {
    const style = document.createElement('style');
    // Force hide UI layer and Start Screen immediately
    style.innerHTML = '#ui-layer, #start-screen { display: none !important; }';
    document.head.appendChild(style);
}

window.onload = () => {
    const game = new Game();
    
    // UI Elements
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');
    const renderScreen = document.getElementById('render-start-screen');
    const renderBtn = document.getElementById('play-render-btn');

    // Check Mode
    const urlParams = new URLSearchParams(window.location.search);
    const renderUrl = urlParams.get('render');

    if (renderUrl) {
        // RENDER MODE: Show Play Replay Button
        if (renderScreen) {
            renderScreen.classList.remove('hidden');
            renderScreen.style.display = 'flex';
        }
        
        if (renderBtn) {
            renderBtn.addEventListener('click', () => {
                if (renderScreen) renderScreen.classList.add('hidden');
                // Start replay logic which includes resuming audio context
                game.loadReplayFromURL(renderUrl);
            });
        }
    } else {
        // NORMAL GAME MODE: Show Main Menu
        if (startScreen) {
            startScreen.classList.remove('hidden');
            startScreen.style.display = 'flex';
        }

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (startScreen) startScreen.classList.add('hidden');
                game.start();
            });
        }
    }

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

