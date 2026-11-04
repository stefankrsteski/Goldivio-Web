// Goldivio - scroll reveal for the gallery, features, FAQ and download
// card; a frosted sticky nav with hysteresis (no flicker near the
// threshold); a gentle parallax on the two side hero phones; and a
// one-at-a-time FAQ. Respects prefers-reduced-motion; degrades
// gracefully if IntersectionObserver isn't available. The hero itself
// is never hidden by script, so the first paint is always complete.

(function () {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Scroll reveal ----------
    var targets = document.querySelectorAll(
        '.section-head, .row-label, .shot, .feat, .stats, .faq-list, .cta'
    );

    targets.forEach(function (el) {
        el.classList.add('reveal');
    });

    // Stagger siblings inside the same grid so rows cascade in.
    document.querySelectorAll('.row-grid, .feat-grid').forEach(function (grid) {
        Array.prototype.forEach.call(grid.children, function (child, i) {
            child.style.transitionDelay = (i % 3) * 140 + 'ms';
        });
    });

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
        targets.forEach(function (el) {
            el.classList.add('is-visible');
        });
    } else {
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        );

        targets.forEach(function (el) {
            observer.observe(el);
        });
    }

    // ---------- Sticky nav + hero parallax ----------
    var nav = document.querySelector('.nav');
    var stage = document.querySelector('.stage');
    var SHOW_AT = 40;
    var HIDE_AT = 12;
    var scrolled = false;
    var ticking = false;

    function update() {
        var y = window.scrollY;

        if (nav) {
            if (!scrolled && y > SHOW_AT) {
                scrolled = true;
                nav.classList.add('nav--scrolled');
            } else if (scrolled && y < HIDE_AT) {
                scrolled = false;
                nav.classList.remove('nav--scrolled');
            }
        }

        if (stage && !prefersReduced) {
            stage.style.setProperty('--p', Math.min(y, 700));
        }

        ticking = false;
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });

    update();

    // ---------- FAQ: keep one answer open at a time ----------
    var items = document.querySelectorAll('.faq-list details');

    items.forEach(function (item) {
        item.addEventListener('toggle', function () {
            if (!item.open) return;
            items.forEach(function (other) {
                if (other !== item) other.removeAttribute('open');
            });
        });
    });
})();
