// Goldivio - subtle scroll reveal for deposit boxes and rack
// monitors, plus a frosted state for the sticky nav once the page
// scrolls. Respects prefers-reduced-motion; degrades gracefully if
// IntersectionObserver isn't available.

(function () {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var targets = document.querySelectorAll('.box, .monitor, .vault-door');
    targets.forEach(function (el) {
        el.classList.add('reveal');
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
            { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
        );

        targets.forEach(function (el) {
            observer.observe(el);
        });
    }

    // Sticky nav: switch to a frosted state once the page scrolls
    // past a small threshold.
    var nav = document.querySelector('.nav');
    if (nav) {
        var THRESHOLD = 8;
        var ticking = false;

        function updateNav() {
            if (window.scrollY > THRESHOLD) {
                nav.classList.add('nav--scrolled');
            } else {
                nav.classList.remove('nav--scrolled');
            }
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) {
                window.requestAnimationFrame(updateNav);
                ticking = true;
            }
        }, { passive: true });

        updateNav();
    }
})();
