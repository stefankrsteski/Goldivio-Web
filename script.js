// Goldivio — subtle scroll reveal for ledger rows and vault slots.
// Respects prefers-reduced-motion; degrades to "always visible" if
// IntersectionObserver isn't available.

(function () {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var targets = document.querySelectorAll('.ledger-row, .slot, .certificate');
    targets.forEach(function (el) {
        el.classList.add('reveal');
    });

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
        targets.forEach(function (el) {
            el.classList.add('is-visible');
        });
        return;
    }

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
})();
