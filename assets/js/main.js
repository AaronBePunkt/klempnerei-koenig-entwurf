/* ===========================================================
   Günter König Heizung–Sanitär · Ratzeburg
   Website-Entwurf – Avalanche Commerce
   Alle Rechenannahmen sind in der Projekt-Notiz dokumentiert.
   =========================================================== */
(function () {
  'use strict';

  /* ---------- Helfer ---------- */
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function eur(n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n));
  }
  function num(n, d) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).format(n);
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    var burger = $('.burger'), menu = $('.mobilenav');
    if (!burger || !menu) return;
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.mobilenav a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.focus();
      }
    });
  }

  /* ---------- Entwurfs-Hinweis ---------- */
  function initDraftbar() {
    var b = $('.draftbar');
    if (!b) return;
    var btn = $('button', b);
    if (btn) btn.addEventListener('click', function () { b.remove(); });
  }

  /* ===========================================================
     WATT-RECHNER  ·  Heizlast, Wärmebedarf, Kosten, Förderung
     =========================================================== */

  /* Spezifische Heizlast in W/m² nach Baualter / Dämmstandard.
     Richtwerte der Heizlast-Faustformel (Orientierung, keine DIN EN 12831). */
  var W_PER_SQM = {
    vor1978:  150,
    b1978_94: 110,
    b1995_01:  85,
    b2002_15:  62,
    ab2016:    42,
    passiv:    22
  };

  /* Gebäudetyp: Faktor für wärmeabgebende Außenflächen / Kompaktheit */
  var TYPE_F = {
    efh:     1.00,
    doppel:  0.92,
    reihe:   0.85,
    wohnung: 0.80,
    mfh:     0.95
  };

  /* Bereits erfolgte Modernisierungen: multiplikative Reduktionsfaktoren */
  var MOD_F = { dach: 0.90, fassade: 0.86, fenster: 0.90, keller: 0.96 };

  /* Energiepreise (Richtwerte Norddeutschland 2026) und Wirkungsgrade */
  var PRICE = { gas: 0.115, oel: 0.105, strom_wp: 0.26, strom_direkt: 0.32, fernwaerme: 0.140, pellet: 0.075 };
  var ETA   = { gas_alt: 0.78, oel_alt: 0.76, gas_neu: 0.95, oel_neu: 0.92, pellet: 0.88 };
  var VBH   = 1900;      /* Vollbenutzungsstunden Heizung pro Jahr */
  var WW_KWH_P = 750;    /* Warmwasser-Bedarf je Person und Jahr in kWh */

  /* Verfügbare Gerätegrößen (kW) zum Aufrunden */
  var SIZES_WP  = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 22, 26, 30];
  var SIZES_GAS = [11, 14, 15, 18, 20, 24, 28, 32, 38, 45];

  function stepUp(kw, list) {
    for (var i = 0; i < list.length; i++) { if (list[i] >= kw) return list[i]; }
    return Math.ceil(kw);
  }

  function initWattRechner() {
    var root = $('#wattrechner');
    if (!root) return;

    var steps    = $$('.qstep', root);
    var result   = $('.result', root);
    var bar      = $('.calc__bar i', root);
    var counter  = $('.calc__count', root);
    var btnNext  = $('[data-next]', root);
    var btnPrev  = $('[data-prev]', root);
    var btnAgain = $('[data-again]', root);
    var idx = 0;

    /* Flächen-Slider */
    var area = $('#wr-area', root), areaOut = $('#wr-area-val', root);
    if (area && areaOut) {
      var syncArea = function () { areaOut.textContent = num(+area.value); };
      area.addEventListener('input', syncArea);
      syncArea();
    }
    /* Personen-Slider */
    var pers = $('#wr-pers', root), persOut = $('#wr-pers-val', root);
    if (pers && persOut) {
      var syncPers = function () { persOut.textContent = num(+pers.value); };
      pers.addEventListener('input', syncPers);
      syncPers();
    }

    function show(i) {
      idx = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (s, n) { s.classList.toggle('is-active', n === idx); });
      result.classList.remove('is-active');
      $('.calc__nav', root).style.display = '';
      if (bar) bar.style.width = ((idx + 1) / steps.length * 100).toFixed(1) + '%';
      if (counter) counter.textContent = 'Schritt ' + (idx + 1) + ' von ' + steps.length;
      btnPrev.style.visibility = idx === 0 ? 'hidden' : 'visible';
      btnNext.textContent = idx === steps.length - 1 ? 'Ergebnis berechnen' : 'Weiter';
      root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function valOf(name) {
      var el = root.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : null;
    }
    function multiOf(name) {
      return $$('input[name="' + name + '"]:checked', root).map(function (e) { return e.value; });
    }

    /* Pflichtauswahl je Schritt prüfen */
    function validateStep() {
      var need = steps[idx].getAttribute('data-require');
      if (!need) return true;
      if (valOf(need)) { hideErr(); return true; }
      var e = $('.qstep-err', steps[idx]);
      if (e) e.classList.add('is-on');
      return false;
    }
    function hideErr() {
      $$('.qstep-err', root).forEach(function (e) { e.classList.remove('is-on'); });
    }
    root.addEventListener('change', hideErr);

    btnNext.addEventListener('click', function () {
      if (!validateStep()) return;
      if (idx === steps.length - 1) { calculate(); } else { show(idx + 1); }
    });
    btnPrev.addEventListener('click', function () { show(idx - 1); });
    if (btnAgain) btnAgain.addEventListener('click', function () { show(0); });

    /* ---------- Berechnung ---------- */
    function calculate() {
      var typ   = valOf('wr-typ')   || 'efh';
      var bau   = valOf('wr-bau')   || 'b1995_01';
      var alt   = valOf('wr-alt')   || 'gas_alt';
      var wunsch = valOf('wr-wunsch') || 'offen';
      var flaeche = area ? +area.value : 140;
      var personen = pers ? +pers.value : 3;
      var mods = multiOf('wr-mod');
      var hoch = mods.indexOf('deckenhoehe') > -1;
      var flaechenheizung = mods.indexOf('flaechenheizung') > -1;

      /* 1) Spezifische Heizlast */
      var spez = W_PER_SQM[bau] || 85;
      ['dach', 'fassade', 'fenster', 'keller'].forEach(function (m) {
        if (mods.indexOf(m) > -1) spez *= MOD_F[m];
      });
      spez *= (TYPE_F[typ] || 1);
      if (hoch) spez *= 1.12;
      spez = Math.max(18, spez);

      /* 2) Heizlast Raumwärme + Warmwasser-Zuschlag */
      var lastRaumW = flaeche * spez;                 /* Watt */
      var lastWWkW  = personen * 0.25;                /* kW Gleichzeitigkeitszuschlag */
      var lastGeskW = lastRaumW / 1000 + lastWWkW;

      /* 3) Jahres-Nutzwärmebedarf */
      var qHeiz = (lastRaumW / 1000) * VBH;           /* kWh/a */
      var qWW   = personen * WW_KWH_P;                /* kWh/a */
      var qGes  = qHeiz + qWW;

      /* 4) Jahreskosten je System */
      var jaz = flaechenheizung ? 4.0 : 3.3;
      var kosten = {
        waermepumpe: (qGes / jaz) * PRICE.strom_wp,
        gas_neu:     (qGes / ETA.gas_neu) * PRICE.gas,
        oel_neu:     (qGes / ETA.oel_neu) * PRICE.oel,
        pellet:      (qGes / ETA.pellet) * PRICE.pellet,
        fernwaerme:   qGes * PRICE.fernwaerme
      };
      var kostenAlt = {
        gas_alt:  (qGes / ETA.gas_alt) * PRICE.gas,
        oel_alt:  (qGes / ETA.oel_alt) * PRICE.oel,
        nachtstrom: qGes * PRICE.strom_direkt,
        fernwaerme: qGes * PRICE.fernwaerme,
        pellet:   (qGes / ETA.pellet) * PRICE.pellet,
        keine:    null
      }[alt];

      /* 5) Empfohlene Geräteleistung */
      var kwWP  = stepUp(lastGeskW, SIZES_WP);
      var kwGas = stepUp(lastGeskW, SIZES_GAS);

      /* 6) Investitionsrahmen (Richtwerte inkl. Montage, Norddeutschland 2026) */
      var invest = {
        waermepumpe: [13000 + kwWP * 700,  20000 + kwWP * 1050],
        gas_neu:     [ 8500 + kwGas * 130, 13500 + kwGas * 240],
        hybrid:      [19000 + kwWP * 700,  27000 + kwWP * 1050]
      };
      var pick = (wunsch === 'gas') ? 'gas_neu' : (wunsch === 'hybrid' ? 'hybrid' : 'waermepumpe');
      var inv  = invest[pick];

      /* 7) Förderung (BEG Einzelmaßnahmen, Stand 2026 – im Gespräch zu prüfen) */
      var foerderfaehig = Math.min(inv[1], 30000);
      var quote = 0, hinweise = [];
      if (pick === 'waermepumpe' || pick === 'hybrid') {
        quote = 30; hinweise.push('30 % Grundförderung');
        if (alt === 'gas_alt' || alt === 'oel_alt' || alt === 'nachtstrom') {
          quote += 20; hinweise.push('20 % Klimageschwindigkeits-Bonus (Austausch alter Heizung)');
        }
        quote += 5; hinweise.push('5 % Effizienz-Bonus (natürliches Kältemittel)');
        quote = Math.min(quote, 70);
      }
      var foerderBetrag = foerderfaehig * quote / 100;

      var einsparung = kostenAlt ? kostenAlt - kosten[pick === 'gas_neu' ? 'gas_neu' : 'waermepumpe'] : null;

      render({
        spez: spez, flaeche: flaeche, personen: personen,
        lastRaumW: lastRaumW, lastWWkW: lastWWkW, lastGeskW: lastGeskW,
        qHeiz: qHeiz, qWW: qWW, qGes: qGes,
        kosten: kosten, kostenAlt: kostenAlt, alt: alt,
        kwWP: kwWP, kwGas: kwGas, pick: pick, inv: inv,
        quote: quote, foerderBetrag: foerderBetrag, hinweise: hinweise,
        einsparung: einsparung, jaz: jaz, wunsch: wunsch
      });
    }

    var ALT_LABEL = {
      gas_alt: 'Gasheizung (älter als 20 Jahre)', oel_alt: 'Ölheizung (älter als 20 Jahre)',
      nachtstrom: 'Nachtspeicher / Direktstrom', fernwaerme: 'Fernwärme',
      pellet: 'Pellet- oder Holzheizung', keine: 'Neubau – noch keine Heizung'
    };
    var SYS_LABEL = {
      waermepumpe: 'Luft-Wasser-Wärmepumpe', gas_neu: 'Gas-Brennwertheizung',
      oel_neu: 'Öl-Brennwertheizung', pellet: 'Pelletheizung', fernwaerme: 'Fernwärme',
      hybrid: 'Hybrid (Wärmepumpe + Brennwert)'
    };

    function render(r) {
      steps.forEach(function (s) { s.classList.remove('is-active'); });
      $('.calc__nav', root).style.display = 'none';
      if (bar) bar.style.width = '100%';
      if (counter) counter.textContent = 'Ergebnis';

      var kwAnzeige = r.pick === 'gas_neu' ? r.kwGas : r.kwWP;
      var wattRaum  = Math.round(r.lastRaumW);

      $('#wr-kw').textContent    = num(r.lastGeskW, 1);
      $('#wr-watt').textContent  = num(wattRaum) + ' Watt Raumheizlast · ' + num(Math.round(r.spez)) + ' W/m² · zzgl. ' + num(r.lastWWkW, 1) + ' kW Warmwasser';
      $('#wr-size').textContent  = num(kwAnzeige) + ' kW';
      $('#wr-size-n').textContent = SYS_LABEL[r.pick] + ' – nächste Gerätegröße';
      $('#wr-q').textContent     = num(Math.round(r.qGes / 10) * 10) + ' kWh';
      $('#wr-inv').textContent   = eur(r.inv[0]) + ' – ' + eur(r.inv[1]);

      /* Förderung */
      var fo = $('#wr-foerder-box');
      if (r.quote > 0) {
        fo.style.display = '';
        /* Kein „bis" vor den Betrag: das Wort landet sonst allein in einer Zeile.
           Die Einordnung steht im Kachel-Label und im Fußtext. */
        $('#wr-foerder').textContent = eur(r.foerderBetrag);
        $('#wr-foerder-n').textContent = 'bis zu ' + r.quote + ' % der förderfähigen Kosten';
        var det = $('#wr-foerder-det');
        if (det) det.textContent = r.hinweise.join(' + ');
      } else {
        fo.style.display = 'none';
      }

      /* Einsparung */
      var es = $('#wr-spar-box');
      if (r.einsparung !== null && r.einsparung > 50) {
        es.style.display = '';
        $('#wr-spar').textContent = eur(r.einsparung) + ' / Jahr';
        $('#wr-spar-n').textContent = 'gegenüber ' + ALT_LABEL[r.alt];
      } else {
        es.style.display = 'none';
      }

      /* Kostenvergleich */
      var rows = [
        ['waermepumpe', 'Luft-Wasser-Wärmepumpe', 'Strom · JAZ ' + num(r.jaz, 1)],
        ['gas_neu', 'Gas-Brennwertheizung', 'Erdgas · ' + num(PRICE.gas * 100, 1) + ' ct/kWh'],
        ['oel_neu', 'Öl-Brennwertheizung', 'Heizöl · ' + num(PRICE.oel * 100, 1) + ' ct/kWh'],
        ['pellet', 'Pelletheizung', 'Holzpellets · ' + num(PRICE.pellet * 100, 1) + ' ct/kWh'],
        ['fernwaerme', 'Fernwärme', 'Wärmelieferung · ' + num(PRICE.fernwaerme * 100, 1) + ' ct/kWh']
      ];
      var pickKey = r.pick === 'hybrid' ? 'waermepumpe' : r.pick;
      var html = '<table class="rtab"><thead><tr><th>Heizsystem</th><th>Energieträger</th>' +
                 '<th>Heizkosten / Jahr</th></tr></thead><tbody>';
      rows.forEach(function (row) {
        html += '<tr' + (row[0] === pickKey ? ' class="is-pick"' : '') + '><td>' + row[1] +
                '</td><td>' + row[2] + '</td><td>' + eur(r.kosten[row[0]]) + '</td></tr>';
      });
      if (r.kostenAlt) {
        html += '<tr><td>' + ALT_LABEL[r.alt] + ' <em>(Ihr Bestand)</em></td><td>heutiger Zustand</td><td>' +
                eur(r.kostenAlt) + '</td></tr>';
      }
      html += '</tbody></table>';
      $('#wr-table').innerHTML = html;

      /* Zusammenfassung fürs Kontaktformular */
      var summary =
        'Wohnfläche: ' + num(r.flaeche) + ' m²\n' +
        'Personen im Haushalt: ' + num(r.personen) + '\n' +
        'Spezifische Heizlast: ' + num(Math.round(r.spez)) + ' W/m²\n' +
        'Ermittelte Heizlast: ' + num(r.lastGeskW, 1) + ' kW (' + num(wattRaum) + ' W Raumwärme + ' + num(r.lastWWkW, 1) + ' kW Warmwasser)\n' +
        'Empfohlene Geräteleistung: ' + num(kwAnzeige) + ' kW ' + SYS_LABEL[r.pick] + '\n' +
        'Jahres-Wärmebedarf: ' + num(Math.round(r.qGes)) + ' kWh\n' +
        'Bestandsheizung: ' + ALT_LABEL[r.alt] + '\n' +
        'Investitionsrahmen: ' + eur(r.inv[0]) + ' – ' + eur(r.inv[1]) +
        (r.quote > 0 ? '\nFörderung möglich: bis ' + r.quote + ' % (' + eur(r.foerderBetrag) + ')' : '');
      var ta = $('#wr-summary');
      if (ta) ta.value = summary;
      var pre = $('#wr-summary-pre');
      if (pre) pre.textContent = summary;

      result.classList.add('is-active');
      result.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    show(0);
  }

  /* ===========================================================
     BAD-BUDGETPLANER
     =========================================================== */
  function initBadplaner() {
    var root = $('#badplaner');
    if (!root) return;

    var LEVEL = { solide: [1900, 2600], komfort: [2600, 3600], premium: [3600, 5200] };
    var SCOPE = { objekte: 0.45, komplett: 1.0, kern: 1.25 };
    var EXTRA = {
      dusche:   [1500, 2600, 'Bodengleiche Walk-in-Dusche'],
      fbh:      [0,    0,    'Elektrische Fußbodenheizung'],   /* je m², s. unten */
      doppel:   [900,  1600, 'Doppelwaschtisch'],
      wanne:    [1700, 3200, 'Freistehende Badewanne'],
      barrier:  [2200, 3900, 'Barrierefreier Ausbau'],
      design:   [500,   950, 'Design-Handtuchheizkörper'],
      licht:    [450,   900, 'Licht- & Spiegelkonzept']
    };

    var size = $('#bp-size', root), sizeOut = $('#bp-size-val', root);
    function calc() {
      var m2 = +size.value;
      var lvl = (root.querySelector('input[name="bp-level"]:checked') || {}).value || 'komfort';
      var scp = (root.querySelector('input[name="bp-scope"]:checked') || {}).value || 'komplett';
      var lo = LEVEL[lvl][0] * m2 * SCOPE[scp];
      var hi = LEVEL[lvl][1] * m2 * SCOPE[scp];
      var extras = [];
      $$('input[name="bp-extra"]:checked', root).forEach(function (e) {
        if (e.value === 'fbh') { lo += 75 * m2; hi += 130 * m2; extras.push(EXTRA.fbh[2]); return; }
        var x = EXTRA[e.value]; if (!x) return;
        lo += x[0]; hi += x[1]; extras.push(x[2]);
      });
      sizeOut.textContent = num(m2);
      $('#bp-out').textContent = eur(lo) + ' – ' + eur(hi);
      $('#bp-perm2').textContent = eur(lo / m2) + ' – ' + eur(hi / m2) + ' pro m²';
      $('#bp-extras').textContent = extras.length ? extras.join(' · ') : 'keine Zusatzwünsche gewählt';
      var d = $('#bp-days');
      var days = Math.round((m2 * (scp === 'objekte' ? 0.9 : scp === 'kern' ? 2.4 : 1.8)) + 4);
      d.textContent = 'ca. ' + Math.max(4, days - 3) + '–' + (days + 4) + ' Arbeitstage';
    }
    root.addEventListener('input', calc);
    root.addEventListener('change', calc);
    calc();
  }

  /* ===========================================================
     FORMULARE (Entwurf: keine echte Übermittlung)
     =========================================================== */
  function initForms() {
    $$('form[data-demo]').forEach(function (form) {
      form.setAttribute('novalidate', 'novalidate');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = true, first = null;

        $$('[required]', form).forEach(function (f) {
          var bad = false;
          if (f.type === 'checkbox') bad = !f.checked;
          else if (!f.value.trim()) bad = true;
          else if (f.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(f.value.trim());
          else if (f.type === 'tel') bad = f.value.replace(/[^0-9]/g, '').length < 6;

          f.classList.toggle('err', bad);
          var msg = f.parentNode.querySelector('.errtext') ||
                    (f.closest('.field') || form).querySelector('.errtext');
          if (msg) msg.classList.toggle('is-on', bad);
          if (bad) { ok = false; if (!first) first = f; }
        });

        if (!ok) { if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }

        var box = form.parentNode.querySelector('.formmsg') || form.querySelector('.formmsg');
        if (box) {
          box.classList.add('is-on');
          box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        form.querySelectorAll('input,select,textarea,button').forEach(function (f) { f.disabled = true; });
      });

      $$('input,select,textarea', form).forEach(function (f) {
        f.addEventListener('input', function () {
          f.classList.remove('err');
          var m = f.parentNode.querySelector('.errtext');
          if (m) m.classList.remove('is-on');
        });
      });
    });
  }

  /* ---------- Anliegen aus Karten in das Kontaktformular ---------- */
  function initPrefill() {
    $$('[data-prefill]').forEach(function (a) {
      a.addEventListener('click', function () {
        try { sessionStorage.setItem('kk_anliegen', a.getAttribute('data-prefill')); } catch (e) {}
      });
    });
    var sel = $('#k-anliegen');
    if (sel) {
      try {
        var v = sessionStorage.getItem('kk_anliegen');
        if (v) { sel.value = v; sessionStorage.removeItem('kk_anliegen'); }
      } catch (e) {}
    }
  }

  /* ---------- Zahlen beim Scrollen hochzählen ---------- */
  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, to = parseFloat(el.getAttribute('data-count'));
        var suf = el.getAttribute('data-suffix') || '', t0 = null;
        function tick(t) {
          if (!t0) t0 = t;
          var p = Math.min(1, (t - t0) / 900);
          el.textContent = num(Math.round(to * (1 - Math.pow(1 - p, 3)))) + suf;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: .4 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------- Start ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initDraftbar();
    initWattRechner();
    initBadplaner();
    initForms();
    initPrefill();
    initCounters();
  });
})();
