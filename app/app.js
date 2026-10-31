// Goldivio web app - keeps the collection in this browser (localStorage).
(function () {
    'use strict';

    var STORAGE_KEY = 'goldivio.web.collection.v1';
    var SETTINGS_KEY = 'goldivio.web.settings.v1';
    var GRAMS_PER_OZ = 31.1034768;

    var ENUMS = {
        metalType: [['GOLD', 'Gold'], ['SILVER', 'Silver']],
        bullionType: [['BAR', 'Bar'], ['COIN', 'Coin']],
        weightUnit: [['GRAM', 'g'], ['OZ', 'oz']],
        currency: ['CHF', 'EUR', 'USD', 'AUD', 'CAD', 'CNY', 'GBP', 'HKD', 'INR', 'JPY', 'MKD', 'RUB', 'SGD'].map(function (c) { return [c, c]; }),
        storageLocation: [['NONE', 'Not set'], ['HOME', 'Home'], ['BANK', 'Bank'], ['VAULT', 'Vault']],
        // Status values were not specified - adjust to match the Android app.
        status: [['OWNED', 'Owned'], ['SOLD', 'Sold']]
    };

    var state = {
        items: [], metal: 'all', type: 'all', editingId: null, detailId: null,
        settings: { currency: 'USD', goldSpot: 0, silverSpot: 0 }
    };

    // ---------- helpers ----------

    function $(id) { return document.getElementById(id); }

    function label(key, value) {
        var list = ENUMS[key] || [];
        for (var i = 0; i < list.length; i++) if (list[i][0] === value) return list[i][1];
        return value || '';
    }

    function todayISO() {
        var d = new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function newId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function num(v) {
        var n = parseFloat(v);
        return isFinite(n) ? n : 0;
    }

    function fmtNumber(n, max) {
        return Number(n).toLocaleString(undefined, { maximumFractionDigits: max == null ? 2 : max });
    }

    function fmtMoney(n, currency) {
        currency = currency || state.settings.currency;
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(n);
        } catch (e) {
            return fmtNumber(n, 2) + ' ' + currency;
        }
    }

    function fmtWeight(item) {
        return fmtNumber(item.weight, 4) + ' ' + label('weightUnit', item.weightUnit);
    }

    function fineOz(item) {
        var oz = item.weightUnit === 'GRAM' ? item.weight / GRAMS_PER_OZ : item.weight;
        return oz * (item.fineness / 1000);
    }

    function fmtDate(iso) {
        if (!iso) return '';
        var p = iso.split('-');
        if (p.length !== 3) return iso;
        var d = new Date(+p[0], +p[1] - 1, +p[2]);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    // ---------- storage ----------

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            state.items = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            state.items = [];
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
            return true;
        } catch (e) {
            alert('Could not save to this browser. Storage may be full or blocked (private mode).');
            return false;
        }
    }

    function loadSettings() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            var p = raw ? JSON.parse(raw) : {};
            var cur = ENUMS.currency.some(function (c) { return c[0] === p.currency; }) ? p.currency : 'USD';
            state.settings = { currency: cur, goldSpot: num(p.goldSpot), silverSpot: num(p.silverSpot) };
        } catch (e) {
            state.settings = { currency: 'USD', goldSpot: 0, silverSpot: 0 };
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
            return true;
        } catch (e) {
            alert('Could not save to this browser. Storage may be full or blocked (private mode).');
            return false;
        }
    }

    function setCurLabels(root, cur) {
        root.querySelectorAll('.cur').forEach(function (n) { n.textContent = '(' + cur + ')'; });
        root.querySelectorAll('.cur-name').forEach(function (n) { n.textContent = cur; });
    }

    // ---------- icons ----------

    var iconUid = 0;

    function esc(v) {
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function clip(v, n) {
        v = String(v || '').trim();
        return v.length > n ? v.slice(0, n - 1) + '.' : v;
    }

    // Largest font size (up to max) that keeps the text inside width
    function fit(text, max, width, min) {
        return Math.max(min, Math.min(max, width / (Math.max(text.length, 1) * 0.62)));
    }

    // Embossed text: a light copy under the dark one gives an engraved look
    function engraved(text, x, y, size, ink, family, weight, spacing) {
        var attrs = ' x="' + x + '" text-anchor="middle" font-size="' + size.toFixed(1) + '" font-family="' + family +
            '" font-weight="' + weight + '" letter-spacing="' + spacing + '"';
        return '<text' + attrs + ' y="' + (y + 0.7) + '" fill="#ffffff" fill-opacity="0.4">' + esc(text) + '</text>' +
            '<text' + attrs + ' y="' + y + '" fill="' + ink + '">' + esc(text) + '</text>';
    }

    var DISPLAY = "'Space Grotesk', 'Arial Narrow', sans-serif";
    var MONO = "'IBM Plex Mono', monospace";

    function barSVG(item, m, ink) {
        var brand = clip(item.brand, 20).toUpperCase();
        var weight = fmtWeight(item);
        var serial = clip(item.serialNumber, 18);
        var out = '<svg class="ico-bar" viewBox="0 0 160 240" role="img" aria-label="' + m + ' bar">' +
            '<ellipse cx="80" cy="233" rx="62" ry="5" fill="rgba(0,0,0,0.38)"/>' +
            '<rect x="16" y="8" width="128" height="218" rx="12" fill="url(#g-' + m + '-edge)"/>' +
            '<rect x="24" y="16" width="112" height="202" rx="6" fill="url(#g-' + m + '-face)"/>' +
            '<rect x="24" y="16" width="112" height="202" rx="6" fill="none" stroke="' + ink + '" stroke-opacity="0.35" stroke-width="1"/>';
        if (brand) {
            out += engraved(brand, 80, 54, fit(brand, 14, 98, 6), ink, DISPLAY, 700, 0.8);
            out += '<line x1="36" y1="66" x2="124" y2="66" stroke="' + ink + '" stroke-opacity="0.35"/>';
        }
        out += engraved(weight, 80, 132, fit(weight, 34, 98, 12), ink, DISPLAY, 700, 0);
        out += engraved(fmtNumber(item.fineness, 1), 80, 152, 10, ink, MONO, 500, 0.6);
        if (serial) {
            out += '<line x1="36" y1="178" x2="124" y2="178" stroke="' + ink + '" stroke-opacity="0.35"/>';
            out += engraved(serial, 80, 198, fit(serial, 11, 98, 5.5), ink, MONO, 600, 0.4);
        }
        out += '<rect x="16" y="8" width="128" height="218" rx="12" fill="url(#g-shine)" opacity="0.6"/></svg>';
        return out;
    }

    function coinSVG(item, m, ink) {
        var id = ++iconUid;
        var brand = clip(item.brand, 24).toUpperCase();
        var series = clip(item.series, 26).toUpperCase();
        var weight = fmtWeight(item);
        var out = '<svg class="ico-coin" viewBox="0 0 200 200" role="img" aria-label="' + m + ' coin">' +
            '<defs>' +
            '<path id="arcT' + id + '" d="M 42 96 A 58 58 0 0 1 158 96"/>' +
            '<path id="arcB' + id + '" d="M 28 96 A 72 72 0 0 0 172 96"/>' +
            '</defs>' +
            '<ellipse cx="100" cy="192" rx="64" ry="5" fill="rgba(0,0,0,0.38)"/>' +
            '<circle cx="100" cy="96" r="94" fill="url(#g-' + m + '-edge)"/>' +
            '<circle cx="100" cy="96" r="89" fill="none" stroke="' + ink + '" stroke-opacity="0.3" stroke-width="8" stroke-dasharray="1.6 2.2"/>' +
            '<circle cx="100" cy="96" r="84" fill="url(#g-' + m + '-radial)"/>' +
            '<circle cx="100" cy="96" r="84" fill="none" stroke="' + ink + '" stroke-opacity="0.4" stroke-width="1.2"/>' +
            '<circle cx="100" cy="96" r="50" fill="url(#g-' + m + '-face)" stroke="' + ink + '" stroke-opacity="0.35" stroke-width="1"/>' +
            '<circle cx="32" cy="96" r="2.2" fill="' + ink + '" fill-opacity="0.6"/>' +
            '<circle cx="168" cy="96" r="2.2" fill="' + ink + '" fill-opacity="0.6"/>';
        if (brand) {
            out += '<text font-size="' + fit(brand, 11, 150, 6).toFixed(1) + '" font-family="' + DISPLAY + '" font-weight="700" letter-spacing="1" fill="' + ink + '">' +
                '<textPath href="#arcT' + id + '" startOffset="50%" text-anchor="middle">' + esc(brand) + '</textPath></text>';
        }
        if (series) {
            out += '<text font-size="' + fit(series, 11, 180, 6).toFixed(1) + '" font-family="' + DISPLAY + '" font-weight="700" letter-spacing="1" fill="' + ink + '">' +
                '<textPath href="#arcB' + id + '" startOffset="50%" text-anchor="middle">' + esc(series) + '</textPath></text>';
        }
        out += engraved(weight, 100, 98, fit(weight, 28, 66, 11), ink, DISPLAY, 700, 0);
        out += engraved(fmtNumber(item.fineness, 1), 100, 116, 9, ink, MONO, 500, 0.5);
        out += '<circle cx="100" cy="96" r="94" fill="url(#g-shine)" opacity="0.5"/></svg>';
        return out;
    }

    function iconSVG(item) {
        var m = item.metalType === 'SILVER' ? 'silver' : 'gold';
        var ink = m === 'silver' ? '#4a4f58' : '#5a4420';
        return item.bullionType === 'COIN' ? coinSVG(item, m, ink) : barSVG(item, m, ink);
    }

    // ---------- render ----------

    function filtered() {
        return state.items.filter(function (it) {
            if (state.metal !== 'all' && it.metalType !== state.metal) return false;
            if (state.type !== 'all' && it.bullionType !== state.type) return false;
            return true;
        });
    }

    function title(item) {
        var parts = [item.brand, item.series].filter(Boolean).join(' - ');
        return parts || (label('metalType', item.metalType) + ' ' + label('bullionType', item.bullionType).toLowerCase());
    }

    function renderSummary() {
        var owned = state.items.filter(function (i) { return i.status !== 'SOLD'; });
        var goldOz = 0, silverOz = 0, paid = 0;
        owned.forEach(function (i) {
            if (i.metalType === 'GOLD') goldOz += fineOz(i); else silverOz += fineOz(i);
            paid += i.purchasePrice;
        });
        var gs = state.settings.goldSpot, ss = state.settings.silverSpot;
        var missing = (goldOz > 0 && !(gs > 0)) || (silverOz > 0 && !(ss > 0));
        var value = goldOz * gs + silverOz * ss;
        var diff = value - paid;

        var stats = [];
        if (!missing) {
            var diffLabel = 'Gain / loss';
            if (paid > 0) diffLabel += ' (' + (diff >= 0 ? '+' : '-') + fmtNumber(Math.abs(diff / paid * 100), 1) + '%)';
            stats.push([fmtMoney(value), 'Portfolio value', '']);
            stats.push([fmtMoney(paid), 'Total paid', '']);
            stats.push([(diff >= 0 ? '+' : '-') + fmtMoney(Math.abs(diff)), diffLabel, diff >= 0 ? 'pos' : 'neg']);
            stats.push([String(owned.length), 'Pieces owned', '']);
        } else {
            stats.push([fmtMoney(paid), 'Total paid', '']);
            stats.push([String(owned.length), 'Pieces owned', '']);
        }

        var box = $('summary');
        box.textContent = '';
        box.style.setProperty('--cols', stats.length);
        stats.forEach(function (st) {
            var d = el('div', 'stat');
            d.appendChild(el('span', 'stat-num' + (st[2] ? ' ' + st[2] : ''), st[0]));
            d.appendChild(el('span', 'stat-label', st[1]));
            box.appendChild(d);
        });

        var note = $('summaryNote');
        note.textContent = '';
        if (missing) {
            note.appendChild(document.createTextNode('Set your own gold and silver prices to see what your portfolio is worth - no price feeds, nothing leaves your device. '));
        } else {
            var parts = [];
            if (gs > 0) parts.push('gold at ' + fmtMoney(gs) + ' per oz');
            if (ss > 0) parts.push('silver at ' + fmtMoney(ss) + ' per oz');
            note.appendChild(document.createTextNode(parts.length ? 'Valued with ' + parts.join(' and ') + '. ' : ''));
        }
        var link = el('button', 'link-btn', missing || !(gs > 0 || ss > 0) ? 'Open settings' : 'Change in settings');
        link.type = 'button';
        link.addEventListener('click', openSettings);
        note.appendChild(link);
    }

    function renderGrid() {
        var grid = $('grid');
        grid.textContent = '';
        var list = filtered();

        $('empty').hidden = state.items.length !== 0;
        $('addWrap').hidden = state.items.length === 0;
        document.querySelector('.filters').hidden = state.items.length === 0;
        $('summary').hidden = state.items.length === 0;
        $('summaryNote').hidden = state.items.length === 0;

        list.forEach(function (item) {
            var card = el('button', 'card ' + (item.metalType === 'SILVER' ? 'silver' : 'gold'));
            card.type = 'button';
            card.dataset.id = item.id;

            var art = el('div', 'card-art');
            art.innerHTML = iconSVG(item); // static markup, no user text
            card.appendChild(art);

            var body = el('div', 'card-body');
            body.appendChild(el('h3', null, title(item)));

            var sub = [fmtWeight(item), label('metalType', item.metalType)];
            if (item.year) sub.push(String(item.year));
            body.appendChild(el('p', 'card-sub', sub.join('  /  ')));

            var foot = el('div', 'card-foot');
            foot.appendChild(el('span', 'card-price', fmtMoney(item.purchasePrice)));
            foot.appendChild(el('span', 'badge', fmtDate(item.purchaseDate)));
            body.appendChild(foot);

            card.appendChild(body);
            grid.appendChild(card);
        });

        if (state.items.length && !list.length) {
            var none = el('p', 'storage-note', 'Nothing matches these filters.');
            grid.appendChild(none);
            none.style.gridColumn = '1 / -1';
        }
    }

    function render() {
        renderSummary();
        renderGrid();
    }

    // ---------- form ----------

    var form = $('bullionForm');
    var FIELDS = ['metalType', 'bullionType', 'weight', 'weightUnit', 'brand', 'serialNumber', 'series',
        'purchasePrice', 'receiptNumber', 'purchaseDate', 'edition', 'year', 'country', 'store',
        'certificateNumber', 'spotPricePerOzAtPurchaseTime', 'note'];

    function fillSelects() {
        Object.keys(ENUMS).forEach(function (key) {
            var sel = form.elements[key];
            if (!sel || sel.tagName !== 'SELECT') return;
            sel.textContent = '';
            ENUMS[key].forEach(function (pair) {
                var o = document.createElement('option');
                o.value = pair[0];
                o.textContent = pair[1];
                sel.appendChild(o);
            });
        });
    }

    function openForm(item) {
        state.editingId = item ? item.id : null;
        $('formTitle').textContent = item ? 'Edit bullion' : 'Add bullion';
        $('formError').hidden = true;
        form.reset();
        form.elements.purchaseDate.value = todayISO();
        setCurLabels(form, state.settings.currency);
        if (item) {
            FIELDS.forEach(function (f) {
                if (item[f] != null && form.elements[f]) form.elements[f].value = item[f];
            });
        }
        if ($('detailDialog').open) $('detailDialog').close();
        form.querySelectorAll('.invalid').forEach(function (n) { n.classList.remove('invalid'); });
        syncSlots(true);
        showStep(1, 0);
        $('formDialog').showModal();
    }

    function readForm() {
        var f = form.elements;
        function s(n) { return f[n].value.trim(); }
        return {
            metalType: f.metalType.value,
            bullionType: f.bullionType.value,
            fineness: 999.9, // always 999.9 for now (not shown in the form)
            weight: num(f.weight.value),
            weightUnit: f.weightUnit.value,
            brand: s('brand'),
            serialNumber: s('serialNumber'),
            series: s('series'),
            purchasePrice: num(f.purchasePrice.value),
            currency: state.settings.currency,
            receiptNumber: s('receiptNumber'),
            purchaseDate: f.purchaseDate.value,
            edition: s('edition'),
            year: f.year.value ? parseInt(f.year.value, 10) : 0,
            country: s('country'),
            store: s('store'),
            certificateNumber: s('certificateNumber'),
            spotPricePerOzAtPurchaseTime: num(f.spotPricePerOzAtPurchaseTime.value),
            note: f.note.value.trim(),
            storageLocation: 'NONE', // default, not shown in the form
            status: 'OWNED' // default, not shown in the form
        };
    }

    // ---------- wizard ----------

    var TOTAL = 3;
    var step = 1;
    var panels = form.querySelectorAll('.wiz-panel');
    var stepBtns = form.querySelectorAll('.stepper .step');

    function pop(node) {
        node.classList.remove('pop');
        void node.offsetWidth;
        node.classList.add('pop');
    }

    // Serial number sits in step 1 for bars, series in step 1 for coins.
    // Step 3 gets the other one.
    function syncSlots(silent) {
        var isCoin = form.elements.bullionType.value === 'COIN';
        var serial = form.querySelector('.f-serial');
        var series = form.querySelector('.f-series');
        var a = $('slotA'), b = $('slotB');
        var first = isCoin ? series : serial;
        var third = isCoin ? serial : series;
        if (first.parentNode !== a) {
            a.appendChild(first);
            b.appendChild(third);
            if (!silent) { pop(first); pop(third); }
        }
    }

    function showStep(n, dir) {
        step = n;
        panels.forEach(function (p) {
            var on = +p.dataset.panel === n;
            p.hidden = !on;
            p.classList.remove('from-right', 'from-left');
            if (on && dir) {
                void p.offsetWidth;
                p.classList.add(dir > 0 ? 'from-right' : 'from-left');
            }
        });
        stepBtns.forEach(function (b) {
            var k = +b.dataset.step;
            b.classList.toggle('is-active', k === n);
            b.classList.toggle('is-done', k < n);
            if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        });
        $('stepperFill').style.width = ((n - 1) / (TOTAL - 1) * 100) + '%';
        $('backBtn').textContent = n === 1 ? 'Cancel' : 'Back';
        $('nextBtn').textContent = n === TOTAL ? 'Save' : 'Next';
        $('formError').hidden = true;
        form.querySelector('.wiz-body').scrollTop = 0;
        if (dir && n > 1) {
            var first = form.querySelector('.wiz-panel[data-panel="' + n + '"] input:not([type=radio])');
            if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 80);
        }
    }

    function validateStep(n) {
        var f = form.elements, bad = null, msg = '';
        if (n === 1 && !(num(f.weight.value) > 0)) {
            bad = f.weight; msg = 'Enter a weight greater than zero.';
        }
        if (n === 2) {
            if (f.purchasePrice.value === '') { bad = f.purchasePrice; msg = 'Enter the price you paid.'; }
            else if (!f.purchaseDate.value) { bad = f.purchaseDate; msg = 'Pick a purchase date.'; }
        }
        if (!bad) return true;
        var err = $('formError');
        err.textContent = msg;
        err.hidden = false;
        bad.classList.remove('invalid');
        void bad.offsetWidth;
        bad.classList.add('invalid');
        bad.focus();
        return false;
    }

    function goTo(k) {
        if (k === step) return;
        if (k < step) { showStep(k, -1); return; }
        for (var s = step; s < k; s++) {
            if (!validateStep(s)) {
                if (s !== step) { showStep(s, -1); validateStep(s); }
                return;
            }
        }
        showStep(k, 1);
    }

    form.addEventListener('change', function (e) {
        if (e.target.name === 'bullionType') syncSlots(false);
    });

    form.addEventListener('input', function (e) {
        e.target.classList.remove('invalid');
    });

    stepBtns.forEach(function (b) {
        b.addEventListener('click', function () { goTo(+b.dataset.step); });
    });

    $('backBtn').addEventListener('click', function () {
        if (step > 1) showStep(step - 1, -1); else $('formDialog').close();
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (step < TOTAL) { goTo(step + 1); return; }

        for (var s = 1; s < TOTAL; s++) {
            if (!validateStep(s)) { showStep(s, -1); validateStep(s); return; }
        }

        var data = readForm();
        if (state.editingId) {
            for (var i = 0; i < state.items.length; i++) {
                if (state.items[i].id === state.editingId) {
                    data.id = state.editingId;
                    data.createdAt = state.items[i].createdAt;
                    state.items[i] = data;
                }
            }
        } else {
            data.id = newId();
            data.createdAt = Date.now();
            state.items.unshift(data);
        }
        if (save()) {
            $('formDialog').close();
            render();
        }
    });

    // ---------- detail ----------

    function openDetail(id) {
        var item = state.items.filter(function (i) { return i.id === id; })[0];
        if (!item) return;
        state.detailId = id;
        $('detailTitle').textContent = title(item);

        var body = $('detailBody');
        body.textContent = '';
        var art = el('div', 'detail-art');
        art.innerHTML = iconSVG(item);
        body.appendChild(art);

        var rows = [
            ['Metal', label('metalType', item.metalType)],
            ['Type', label('bullionType', item.bullionType)],
            ['Weight', fmtWeight(item)],
            ['Brand', item.brand],
            ['Series', item.series],
            ['Edition', item.edition],
            ['Mint year', item.year || ''],
            ['Country', item.country],
            ['Serial number', item.serialNumber],
            ['Certificate number', item.certificateNumber],
            ['Price paid', fmtMoney(item.purchasePrice)],
            ['Purchase date', fmtDate(item.purchaseDate)],
            ['Spot per oz at purchase', item.spotPricePerOzAtPurchaseTime ? fmtMoney(item.spotPricePerOzAtPurchaseTime) : ''],
            ['Store', item.store],
            ['Receipt number', item.receiptNumber]
        ];
        var dl = el('dl', 'detail-list');
        rows.forEach(function (r) {
            if (r[1] === '' || r[1] == null) return;
            var d = el('div');
            d.appendChild(el('dt', null, r[0]));
            d.appendChild(el('dd', null, String(r[1])));
            dl.appendChild(d);
        });
        if (item.note) {
            var n = el('div', 'wide');
            n.appendChild(el('dt', null, 'Note'));
            var dd = el('dd', null, item.note);
            dd.style.whiteSpace = 'pre-wrap';
            n.appendChild(dd);
            dl.appendChild(n);
        }
        body.appendChild(dl);
        $('detailDialog').showModal();
    }

    $('editBtn').addEventListener('click', function () {
        var item = state.items.filter(function (i) { return i.id === state.detailId; })[0];
        if (item) openForm(item);
    });

    $('deleteBtn').addEventListener('click', function () {
        if (!confirm('Delete this piece from your collection? This cannot be undone.')) return;
        state.items = state.items.filter(function (i) { return i.id !== state.detailId; });
        if (save()) {
            $('detailDialog').close();
            render();
        }
    });

    // ---------- export / import ----------

    function exportCollection() {
        var blob = new Blob([JSON.stringify({ app: 'goldivio-web', version: 1, items: state.items }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'goldivio-collection-' + todayISO() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    $('exportBtn').addEventListener('click', exportCollection);
    $('exportBtn2').addEventListener('click', exportCollection);

    $('importFile').addEventListener('change', function (e) {
        var file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            try {
                var parsed = JSON.parse(reader.result);
                var items = Array.isArray(parsed) ? parsed : parsed.items;
                if (!Array.isArray(items)) throw new Error('bad');
                var have = {};
                state.items.forEach(function (i) { have[i.id] = true; });
                var added = 0;
                items.forEach(function (it) {
                    if (!it || typeof it !== 'object' || !it.metalType || !it.bullionType) return;
                    if (!it.id || have[it.id]) it.id = newId();
                    it.weight = num(it.weight);
                    it.purchasePrice = num(it.purchasePrice);
                    it.fineness = num(it.fineness) || 999.9;
                    it.currency = state.settings.currency; // same value, current currency
                    state.items.push(it);
                    added++;
                });
                if (save()) { render(); alert('Imported ' + added + ' item(s).'); }
            } catch (err) {
                alert('That file could not be read as a Goldivio export.');
            }
        };
        reader.readAsText(file);
    });

    // ---------- wiring ----------

    $('addBtn').addEventListener('click', function () { openForm(null); });
    $('emptyAdd').addEventListener('click', function () { openForm(null); });

    $('grid').addEventListener('click', function (e) {
        var card = e.target.closest('.card');
        if (card) openDetail(card.dataset.id);
    });

    document.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { b.closest('dialog').close(); });
    });

    document.querySelectorAll('dialog').forEach(function (d) {
        d.addEventListener('click', function (e) { if (e.target === d && d.id !== 'formDialog') d.close(); });
    });

    function chipGroup(id, key, attr) {
        $(id).addEventListener('click', function (e) {
            var chip = e.target.closest('.chip');
            if (!chip) return;
            state[key] = chip.dataset[attr];
            $(id).querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('is-active', c === chip); });
            renderGrid();
        });
    }
    chipGroup('metalChips', 'metal', 'metal');
    chipGroup('typeChips', 'type', 'type');

    // ---------- settings ----------

    var sform = $('settingsForm');

    function openSettings() {
        sform.elements.currency.value = state.settings.currency;
        sform.elements.goldSpot.value = state.settings.goldSpot > 0 ? state.settings.goldSpot : '';
        sform.elements.silverSpot.value = state.settings.silverSpot > 0 ? state.settings.silverSpot : '';
        setCurLabels($('settingsDialog'), state.settings.currency);
        $('settingsDialog').showModal();
    }

    sform.elements.currency.addEventListener('change', function () {
        setCurLabels($('settingsDialog'), sform.elements.currency.value);
    });

    sform.addEventListener('submit', function (e) {
        e.preventDefault();
        var cur = sform.elements.currency.value;
        state.settings = {
            currency: cur,
            goldSpot: Math.max(0, num(sform.elements.goldSpot.value)),
            silverSpot: Math.max(0, num(sform.elements.silverSpot.value))
        };
        // Amounts keep their value; they are simply shown in the chosen currency
        state.items.forEach(function (i) { i.currency = cur; });
        if (saveSettings() && save()) {
            $('settingsDialog').close();
            render();
        }
    });

    $('settingsBtn').addEventListener('click', openSettings);

    // Keep multiple tabs in sync
    window.addEventListener('storage', function (e) {
        if (e.key === STORAGE_KEY || e.key === SETTINGS_KEY) { load(); loadSettings(); render(); }
    });

    fillSelects();
    ENUMS.currency.forEach(function (pair) {
        var o = document.createElement('option');
        o.value = pair[0];
        o.textContent = pair[1];
        sform.elements.currency.appendChild(o);
    });
    load();
    loadSettings();
    render();
})();
