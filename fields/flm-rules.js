/* Field Command shared practice-rule engine.
   Single source of truth: flm_settings.practice_rules (JSON string).
   Structure:
     {
       "max_weekdays": 1,        base pattern: max distinct weekday practices (mon-fri)
       "max_weekend": 1,         base pattern: max Saturday slots
       "expected_total": 2,      how many slots a team is entitled to overall
       "alternatives": [         alternate patterns that also count as compliant
         { "weekdays": ["mon","fri"], "max_weekend": 0, "label": "Monday plus Friday" }
       ]
     }
   A team is OVER (red) only if its claimed days fit NO pattern.
   Used by fields/index.html and fields/admin.html, unit-tested in tests/fields.smoke.mjs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FLM_RULES = api;
})(typeof self !== "undefined" ? self : this, function () {
  var DEFAULT_RULES = {
    max_weekdays: 1,
    max_weekend: 1,
    expected_total: 2,
    alternatives: [{ weekdays: ["mon", "fri"], max_weekend: 0, label: "Monday plus Friday" }]
  };
  var WEEKDAY_LABELS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };

  function parse(raw) {
    if (!raw) return DEFAULT_RULES;
    try {
      var r = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof r.max_weekdays !== "number" || typeof r.max_weekend !== "number") return DEFAULT_RULES;
      return {
        max_weekdays: r.max_weekdays,
        max_weekend: r.max_weekend,
        expected_total: typeof r.expected_total === "number" ? r.expected_total : (r.max_weekdays + r.max_weekend),
        alternatives: Array.isArray(r.alternatives)
          ? r.alternatives.filter(function (a) { return a && Array.isArray(a.weekdays); })
          : []
      };
    } catch (e) {
      return DEFAULT_RULES;
    }
  }

  function plur(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function describe(rules) {
    var parts = [];
    if (rules.max_weekdays > 0 && rules.max_weekend > 0) {
      parts.push(plur(rules.max_weekdays, "weekday practice", "weekday practices") + " plus " + plur(rules.max_weekend, "Saturday practice", "Saturday practices"));
    } else if (rules.max_weekdays > 0) {
      parts.push(plur(rules.max_weekdays, "weekday practice", "weekday practices"));
    } else if (rules.max_weekend > 0) {
      parts.push(plur(rules.max_weekend, "Saturday practice", "Saturday practices"));
    }
    (rules.alternatives || []).forEach(function (a) {
      var label = a.label || (a.weekdays || []).map(function (d) { return WEEKDAY_LABELS[d] || d; }).join(" plus ");
      if (a.max_weekend > 0) label += " plus " + plur(a.max_weekend, "Saturday practice", "Saturday practices");
      parts.push(label);
    });
    return "Each team gets " + parts.join(", or ") + ".";
  }

  /* slots: array of { day_key } for ONE team in ONE season window. */
  function evaluate(rules, slots) {
    var wkSet = {}, sat = 0;
    (slots || []).forEach(function (s) {
      if (String(s.day_key).indexOf("sat") === 0) sat++;
      else wkSet[s.day_key] = 1;
    });
    var wk = Object.keys(wkSet);
    var total = (slots || []).length;

    var patterns = [{ allowed: null, maxWk: rules.max_weekdays, maxSat: rules.max_weekend }];
    (rules.alternatives || []).forEach(function (a) {
      patterns.push({
        allowed: a.weekdays || [],
        maxWk: (a.weekdays || []).length,
        maxSat: typeof a.max_weekend === "number" ? a.max_weekend : 0
      });
    });

    var fitting = patterns.filter(function (p) {
      if (wk.length > p.maxWk || sat > p.maxSat) return false;
      if (p.allowed) {
        for (var i = 0; i < wk.length; i++) {
          if (p.allowed.indexOf(wk[i]) < 0) return false;
        }
      }
      return true;
    });

    if (fitting.length === 0) {
      return {
        status: "over", weekdays: wk, satCount: sat, total: total,
        availWeekday: false, availWeekend: false, availLabels: [],
        message: "Over the guideline: " + plur(wk.length, "weekday", "weekdays") + " and " + plur(sat, "Saturday slot", "Saturday slots") + " claimed. " + describe(rules)
      };
    }

    var availWeekday = fitting.some(function (p) { return wk.length < p.maxWk; });
    var availWeekend = fitting.some(function (p) { return sat < p.maxSat; });
    var labels = [];
    if (availWeekday) labels.push("Weekday practice available");
    if (availWeekend) labels.push("Saturday slot available");
    var status = total === 0 ? "none" : (total < rules.expected_total ? "under" : "ok");
    return {
      status: status, weekdays: wk, satCount: sat, total: total,
      availWeekday: availWeekday, availWeekend: availWeekend, availLabels: labels,
      message: ""
    };
  }

  return { DEFAULT_RULES: DEFAULT_RULES, parse: parse, describe: describe, evaluate: evaluate };
});
