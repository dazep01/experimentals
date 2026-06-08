(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        @font-face {
            font-family: 'RaaIcons';
            /* Cukup arahkan ke file .woff saja */
            src: url('./assets/fonts/icomoon.woff') format('woff');
            font-weight: normal;
            font-style: normal;
        }

        .raa {
            font-family: 'RaaIcons' !important;
            speak: none;
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            text-transform: none;
            line-height: 1;
            -webkit-font-smoothing: antialiased;
            display: inline-block;
        }

        .raa-copilot::before {
            content: "\\e900"; 
        }
    `;
    document.head.appendChild(style);
})();
