(function () {
  "use strict";
  // SVG markup keyed by id. Cards reference a key via card.diagram rather
  // than carrying markup inline, so the content file stays readable and the
  // same drawing can be reused by more than one card without being copied.
  var RIG = (window.RIG = window.RIG || {});
  RIG.diagrams = RIG.diagrams || {};

  // Diagrams are added by the species tasks. Keep this file to drawings only.
})();
