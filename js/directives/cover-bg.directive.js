/**
 * Directive levrCoverColor
 * ────────────────────────
 * Extrait une couleur secondaire de la couverture du livre via Canvas API
 * et l'applique comme background-color inline sur le conteneur parent.
 *
 * Usage dans le template :
 *   <img levr-cover-color="post" ng-src="{{ post.image_url }}">
 * Résultat :
 *   post._coverBg = 'hsl(210, 28%, 25%)'   (dark mode)
 *   post._coverBg = 'hsl(210, 28%, 68%)'   (light mode)
 *
 * Fallback silencieux si l'image bloque le canvas (CORS) :
 *   post._coverBg reste undefined → le CSS background: var(--bg-tertiary) prend le relais.
 */
angular.module('levrApp').directive('levrCoverColor', ['$timeout', function($timeout) {

    /* ── Conversion RGB → HSL ─────────────────────────────────────────── */
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return [Math.round(h * 360), s, l];
    }

    /* ── Extraction de couleur via Canvas ────────────────────────────── */
    function extractColor(src, callback) {
        var img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = function() {
            try {
                /* Petit canvas pour la performance */
                var W = 30, H = 45;
                var canvas = document.createElement('canvas');
                canvas.width = W;
                canvas.height = H;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, W, H);
                /* Lèvera une SecurityError si la réponse CORS est absente */
                var data = ctx.getImageData(0, 0, W, H).data;

                /*
                 * Stratégie : échantillonner la bordure extérieure de la couverture
                 * (3px tout autour). Les bords contiennent souvent la couleur
                 * secondaire / d'arrière-plan de la couverture, pas la couleur
                 * dominante (qui occupe le centre).
                 */
                var BORDER = 3;
                var r = 0, g = 0, b = 0, count = 0;

                function addPixel(x, y) {
                    if (x < 0 || y < 0 || x >= W || y >= H) return;
                    var i = (y * W + x) * 4;
                    /* Ignorer les pixels quasi-transparents */
                    if (data[i + 3] < 128) return;
                    r += data[i]; g += data[i + 1]; b += data[i + 2];
                    count++;
                }

                /* Rangées du haut et du bas */
                for (var row = 0; row < BORDER; row++) {
                    for (var col = 0; col < W; col++) {
                        addPixel(col, row);
                        addPixel(col, H - 1 - row);
                    }
                }
                /* Colonnes gauche et droite (sans redoubler les coins) */
                for (var rowMid = BORDER; rowMid < H - BORDER; rowMid++) {
                    for (var colEdge = 0; colEdge < BORDER; colEdge++) {
                        addPixel(colEdge, rowMid);
                        addPixel(W - 1 - colEdge, rowMid);
                    }
                }

                if (count === 0) { callback(null); return; }

                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);

                var hsl = rgbToHsl(r, g, b);
                var h = hsl[0];
                var s = hsl[1];
                var l = hsl[2];

                /*
                 * Ajustements pour un rendu "cadre" discret :
                 *   - Saturation plafonnée à 35 % (jamais criarde)
                 *   - Luminosité ajustée selon le thème
                 *     dark  → valeur sombre (15–28 %)
                 *     light → valeur pâle   (60–75 %)
                 */
                s = Math.min(s, 0.35);
                var isDark = document.body.classList.contains('dark-mode');
                if (isDark) {
                    l = Math.min(0.28, Math.max(0.15, l * 0.45));
                } else {
                    l = Math.min(0.75, Math.max(0.60, 0.60 + (1 - l) * 0.15));
                }

                callback('hsl(' + h + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%)');

            } catch (e) {
                /* SecurityError (CORS) ou autre → fallback CSS */
                callback(null);
            }
        };

        img.onerror = function() { callback(null); };
        img.src = src;
    }

    /* ── Directive definition ─────────────────────────────────────────── */
    return {
        restrict: 'A',
        link: function(scope, elem, attrs) {
            var post = scope.$eval(attrs.levrCoverColor);
            if (!post) return;

            function doExtract() {
                var src = elem[0].currentSrc || elem[0].src;
                if (!src) return;
                extractColor(src, function(color) {
                    if (color) {
                        $timeout(function() {
                            post._coverBg = color;
                        });
                    }
                });
            }

            /* Image déjà chargée (cache navigateur) */
            if (elem[0].complete && elem[0].naturalWidth) {
                doExtract();
            } else {
                elem.on('load', doExtract);
            }
        }
    };
}]);
