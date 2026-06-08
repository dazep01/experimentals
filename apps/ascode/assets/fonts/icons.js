(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        @font-face {
            font-family: 'RaaIcons';
            src: url('./icomoon.eot?q3se2a');
            src: url('./icomoon.eot?q3se2a#iefix') format('embedded-opentype'),
                 url('./icomoon.ttf?q3se2a') format('truetype'),
                 url('./icomoon.woff?q3se2a') format('woff'),
                 url('./icomoon.svg?q3se2a#icomoon') format('svg');
            font-weight: normal;
            font-style: normal;
            font-display: block;
        }

        /* Menggunakan selector [class^="raa-"] agar otomatis untuk semua ikon raa */
        [class^="raa-"], [class*=" raa-"] {
            font-family: 'RaaIcons' !important;
            speak: never;
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            text-transform: none;
            line-height: 1;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            display: inline-block;
        }

        /* Class untuk ikon Anda */
        .raa-copilot:before {
            content: "\\e900";
        }
    `;
    document.head.appendChild(style);
})();
