(function () {
  "use strict";
  // SVG markup keyed by id. Cards reference a key via card.diagram rather
  // than carrying markup inline, so the content file stays readable and the
  // same drawing can be reused by more than one card without being copied.
  var RIG = (window.RIG = window.RIG || {});
  RIG.diagrams = RIG.diagrams || {};

  // A two jig vertical squid rig. Drawn rather than photographed so the parts
  // can be labelled and the spacing read at a glance on a phone.
  RIG.diagrams["squid-vertical"] =
    '<svg viewBox="0 0 420 560" role="img" aria-label="Two jig vertical squid rig from rod tip down to the bottom weight.">' +
      '<defs>' +
        '<g id="sq-jig">' +
          '<path d="M0 0 L7 26 L0 48 L-7 26 Z" fill="var(--accent)" stroke="var(--accent2)" stroke-width="1.4"/>' +
          '<path d="M-7 48 L0 44 L7 48 M-5 54 L0 46 L5 54" stroke="var(--ink2)" stroke-width="2" fill="none" stroke-linecap="round"/>' +
          '<circle cx="0" cy="6" r="2.6" fill="var(--bg)"/>' +
        '</g>' +
      '</defs>' +
      // main line
      '<path d="M210 14 V500" stroke="var(--rope)" stroke-width="2" opacity=".85"/>' +
      '<text x="222" y="34" font-size="13" fill="var(--dim)">main line, 10 to 15 lb braid</text>' +
      // swivel
      '<circle cx="210" cy="150" r="8" fill="none" stroke="var(--steel)" stroke-width="3"/>' +
      '<text x="226" y="155" font-size="13" fill="var(--ink)" font-weight="600">Swivel</text>' +
      '<text x="226" y="171" font-size="11.5" fill="var(--dim)">stops the line twisting</text>' +
      // upper dropper + jig
      '<path d="M210 230 H150" stroke="var(--rope)" stroke-width="1.6" opacity=".75"/>' +
      '<g transform="translate(150,230)"><use href="#sq-jig"/></g>' +
      '<text x="20" y="226" font-size="13" fill="var(--ink)" font-weight="600" text-anchor="start">Upper jig</text>' +
      '<text x="20" y="242" font-size="11.5" fill="var(--dim)">dropper 8 to 12 in</text>' +
      // lower jig
      '<g transform="translate(210,360)"><use href="#sq-jig"/></g>' +
      '<text x="238" y="372" font-size="13" fill="var(--ink)" font-weight="600">Lower jig</text>' +
      '<text x="238" y="388" font-size="11.5" fill="var(--dim)">tied in line, 24 to 36 in down</text>' +
      // weight
      '<path d="M202 500 h16 l-4 26 h-8 z" fill="var(--steel)"/>' +
      '<text x="228" y="518" font-size="13" fill="var(--ink)" font-weight="600">Just enough weight</text>' +
      '<text x="228" y="534" font-size="11.5" fill="var(--dim)">to hang straight down, no more</text>' +
      // depth bracket
      '<g stroke="var(--dim)" stroke-width="1.2" fill="none" opacity=".8">' +
        '<path d="M110 230 V360"/><path d="M104 230 H116"/><path d="M104 360 H116"/>' +
      '</g>' +
      '<text x="98" y="298" font-size="12" fill="var(--dim)" text-anchor="end">spread</text>' +
    '</svg>';

  // Diagrams are added by the species tasks. Keep this file to drawings only.
})();
