// CoachPilot — Enhanced GA4 Event Tracking
// Tracks: CTA clicks, form submissions, outbound links, scroll depth, blog engagement
(function() {
  // Ensure gtag is available
  if (typeof gtag !== 'function') return;

  // === CTA BUTTON CLICK TRACKING ===
  // Track all links and buttons with meaningful labels
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a, button');
    if (!el) return;

    var href = el.getAttribute('href') || '';
    var text = (el.textContent || '').trim().substring(0, 50);

    // Primary CTA buttons
    if (el.classList.contains('btn-primary') || el.classList.contains('nav-cta')) {
      gtag('event', 'cta_click', {
        event_category: 'engagement',
        event_label: text,
        link_url: href
      });
    }

    // Tool card links
    if (el.classList.contains('tool-card-link')) {
      gtag('event', 'tool_click', {
        event_category: 'engagement',
        event_label: text,
        link_url: href
      });
    }

    // Blog article CTA clicks (the orange box at bottom of blog posts)
    if (el.closest('.article-cta')) {
      gtag('event', 'blog_cta_click', {
        event_category: 'conversion',
        event_label: text,
        link_url: href,
        page_title: document.title
      });
    }

    // "More articles" clicks in blog posts
    if (el.closest('.more-articles')) {
      gtag('event', 'related_article_click', {
        event_category: 'engagement',
        event_label: text,
        link_url: href
      });
    }

    // Outbound links (App Store, external sites)
    if (href && href.indexOf('http') === 0 && href.indexOf(window.location.hostname) === -1) {
      gtag('event', 'outbound_click', {
        event_category: 'outbound',
        event_label: href,
        link_text: text
      });
    }

    // Social media link clicks
    if (el.closest('.social-links')) {
      gtag('event', 'social_click', {
        event_category: 'social',
        event_label: text,
        link_url: href
      });
    }

    // Nav link clicks
    if (el.closest('nav') || el.closest('.nav-mobile')) {
      gtag('event', 'nav_click', {
        event_category: 'navigation',
        event_label: text,
        link_url: href
      });
    }
  });

  // === FORM SUBMISSION TRACKING ===
  document.addEventListener('submit', function(e) {
    var form = e.target;
    var formId = form.id || 'unknown';

    if (formId === 'signup-form') {
      gtag('event', 'email_signup', {
        event_category: 'conversion',
        event_label: 'main_email_form'
      });
    } else if (formId === 'gameday-form') {
      gtag('event', 'email_signup', {
        event_category: 'conversion',
        event_label: 'gameday_interest_form'
      });
    } else {
      gtag('event', 'form_submit', {
        event_category: 'conversion',
        event_label: formId
      });
    }
  });

  // === SCROLL DEPTH TRACKING ===
  var scrollMarks = { 25: false, 50: false, 75: false, 100: false };

  function checkScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ) - window.innerHeight;

    if (docHeight <= 0) return;

    var scrollPercent = Math.round((scrollTop / docHeight) * 100);

    [25, 50, 75, 100].forEach(function(mark) {
      if (scrollPercent >= mark && !scrollMarks[mark]) {
        scrollMarks[mark] = true;
        gtag('event', 'scroll_depth', {
          event_category: 'engagement',
          event_label: mark + '%',
          value: mark
        });
      }
    });
  }

  var scrollTimer;
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(checkScroll, 150);
  }, { passive: true });

  // === TIME ON PAGE TRACKING ===
  var timeMarks = [30, 60, 120, 300]; // seconds
  timeMarks.forEach(function(seconds) {
    setTimeout(function() {
      gtag('event', 'time_on_page', {
        event_category: 'engagement',
        event_label: seconds + 's',
        value: seconds
      });
    }, seconds * 1000);
  });

  // === PAGE TYPE DETECTION ===
  var path = window.location.pathname;
  var pageType = 'other';
  if (path === '/' || path === '/index.html') pageType = 'homepage';
  else if (path.indexOf('/blog/') === 0 && path !== '/blog/' && path !== '/blog/index.html') pageType = 'blog_post';
  else if (path === '/blog/' || path === '/blog/index.html') pageType = 'blog_index';
  else if (path.indexOf('/plans') === 0) pageType = 'practice_plans';

  gtag('event', 'page_type', {
    event_category: 'content',
    event_label: pageType,
    page_path: path
  });
})();
