(function () {
  "use strict";

  const cfg = window.ALBUM_CONFIG || {};
  const slidesBase = cfg.slidesBase || "../album_slides/";
  const manifestUrl = cfg.manifestUrl || "../album_slides/manifest.json";
  const fadeMs = Number(cfg.fadeMs) || 800;
  const speedOptions = Array.isArray(cfg.speedOptionsSec)
    ? cfg.speedOptionsSec
    : [3, 5, 7, 10, 15, 20];
  const storageKey = cfg.storageKey || "anna_slideshow_interval_sec";
  const defaultIntervalSec = Number(cfg.defaultIntervalSec) || 5;

  const layerA = document.getElementById("layerA");
  const layerB = document.getElementById("layerB");
  const imgA = layerA.querySelector("img");
  const imgB = layerB.querySelector("img");
  const statusEl = document.getElementById("status");
  const counterEl = document.getElementById("counter");
  const speedEl = document.getElementById("speed");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnPlay = document.getElementById("btnPlay");
  const btnFs = document.getElementById("btnFs");
  const iconPause = document.getElementById("iconPause");
  const iconPlay = document.getElementById("iconPlay");
  if (cfg.title) document.title = cfg.title;

  document.documentElement.style.setProperty("--fade-ms", fadeMs + "ms");

  let slides = [];
  let index = 0;
  let playing = true;
  let intervalSec = defaultIntervalSec;
  let timerId = null;
  let activeIsA = true;
  let transitioning = false;
  let preloadCache = new Map();
  let hideUiTimer = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function slideUrl(name) {
    return slidesBase.replace(/\/?$/, "/") + name;
  }

  function showStatus(message) {
    statusEl.hidden = false;
    statusEl.querySelector("p").textContent = message;
  }

  function hideStatus() {
    statusEl.hidden = true;
  }

  function loadStoredInterval() {
    try {
      const raw = localStorage.getItem(storageKey);
      const n = Number(raw);
      if (speedOptions.includes(n)) return n;
    } catch (_) {
      /* private mode */
    }
    return defaultIntervalSec;
  }

  function saveInterval(sec) {
    try {
      localStorage.setItem(storageKey, String(sec));
    } catch (_) {
      /* ignore */
    }
  }

  function fillSpeedSelect() {
    speedEl.innerHTML = "";
    speedOptions.forEach(function (sec) {
      const opt = document.createElement("option");
      opt.value = String(sec);
      opt.textContent = String(sec);
      if (sec === intervalSec) opt.selected = true;
      speedEl.appendChild(opt);
    });
  }

  function updateCounter() {
    document.body.classList.toggle("show-cover", slides.length > 0 && index === 0);
    counterEl.textContent = slides.length
      ? index + 1 + " / " + slides.length
      : "— / —";
  }

  function updatePlayButton() {
    iconPause.hidden = !playing;
    iconPlay.hidden = playing;
    btnPlay.setAttribute("aria-label", playing ? "Пауза" : "Воспроизведение");
    btnPlay.title = playing
      ? "Пауза (Пробел)"
      : "Воспроизведение (Пробел)";
  }

  function preload(i) {
    if (!slides.length) return Promise.resolve();
    const name = slides[((i % slides.length) + slides.length) % slides.length];
    const url = slideUrl(name);
    if (preloadCache.has(url)) return preloadCache.get(url);

    const p = new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        resolve(url);
      };
      img.onerror = function () {
        preloadCache.delete(url);
        reject(new Error("Не удалось загрузить: " + name));
      };
      img.src = url;
    });
    preloadCache.set(url, p);
    return p;
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleNext() {
    clearTimer();
    if (!playing || !slides.length) return;
    timerId = setTimeout(function () {
      goTo(index + 1, true);
    }, intervalSec * 1000);
  }

  function activeLayer() {
    return activeIsA ? layerA : layerB;
  }

  function inactiveLayer() {
    return activeIsA ? layerB : layerA;
  }

  function activeImg() {
    return activeIsA ? imgA : imgB;
  }

  function inactiveImg() {
    return activeIsA ? imgB : imgA;
  }

  function goTo(targetIndex, fromTimer) {
    if (!slides.length || transitioning) return;

    const nextIndex =
      ((targetIndex % slides.length) + slides.length) % slides.length;
    if (nextIndex === index && activeImg().src) {
      if (fromTimer) scheduleNext();
      return;
    }

    transitioning = true;
    clearTimer();

    const url = slideUrl(slides[nextIndex]);
    const incoming = inactiveLayer();
    const outgoing = activeLayer();
    const incomingImg = inactiveImg();

    preload(nextIndex)
      .then(function () {
        incomingImg.src = url;
        incomingImg.alt = "Слайд " + (nextIndex + 1);

        // Force reflow so opacity transition always runs
        void incoming.offsetWidth;

        if (reduceMotion) {
          outgoing.classList.remove("is-visible");
          incoming.classList.add("is-visible");
          activeIsA = !activeIsA;
          index = nextIndex;
          updateCounter();
          transitioning = false;
          preload(index + 1);
          if (playing) scheduleNext();
          return;
        }

        incoming.classList.add("is-visible");
        outgoing.classList.remove("is-visible");

        window.setTimeout(function () {
          activeIsA = !activeIsA;
          index = nextIndex;
          updateCounter();
          transitioning = false;
          preload(index + 1);
          if (playing) scheduleNext();
        }, fadeMs);
      })
      .catch(function (err) {
        transitioning = false;
        showStatus(err.message || "Ошибка загрузки слайда");
        if (playing) scheduleNext();
      });
  }

  function showFirst() {
    const url = slideUrl(slides[0]);
    return preload(0).then(function () {
      imgA.src = url;
      imgA.alt = "Слайд 1";
      layerA.classList.add("is-visible");
      layerB.classList.remove("is-visible");
      activeIsA = true;
      index = 0;
      updateCounter();
      hideStatus();
      preload(1);
      if (playing) scheduleNext();
    });
  }

  function togglePlay() {
    playing = !playing;
    updatePlayButton();
    if (playing) scheduleNext();
    else clearTimer();
    revealUi();
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
    revealUi();
  }

  function revealUi() {
    document.body.classList.add("ui-visible");
    if (hideUiTimer) clearTimeout(hideUiTimer);
    hideUiTimer = setTimeout(function () {
      document.body.classList.remove("ui-visible");
    }, 3000);
  }

  function onKey(e) {
    if (document.body.classList.contains("upload-open")) {
      return;
    }
    if (e.target && (e.target.tagName === "SELECT" || e.target.tagName === "INPUT")) {
      return;
    }
    switch (e.code) {
      case "Space":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        goTo(index - 1, false);
        revealUi();
        break;
      case "ArrowRight":
        e.preventDefault();
        goTo(index + 1, false);
        revealUi();
        break;
      case "KeyF":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "Escape":
        // Браузер сам выходит из fullscreen; панель просто покажем
        revealUi();
        break;
      default:
        break;
    }
  }

  btnPrev.addEventListener("click", function () {
    goTo(index - 1, false);
    revealUi();
  });
  btnNext.addEventListener("click", function () {
    goTo(index + 1, false);
    revealUi();
  });
  btnPlay.addEventListener("click", togglePlay);
  btnFs.addEventListener("click", toggleFullscreen);
  speedEl.addEventListener("change", function () {
    intervalSec = Number(speedEl.value);
    saveInterval(intervalSec);
    if (playing) scheduleNext();
    revealUi();
  });

  document.addEventListener("keydown", onKey);
  document.addEventListener("mousemove", revealUi);
  document.addEventListener("touchstart", revealUi, { passive: true });

  intervalSec = loadStoredInterval();
  fillSpeedSelect();
  updatePlayButton();
  revealUi();

  function applySlides(newSlides) {
    if (!Array.isArray(newSlides) || newSlides.length === 0) return;
    slides = newSlides.slice();
    preloadCache.clear();
    if (index >= slides.length) index = Math.max(0, slides.length - 1);
    updateCounter();
    preload(index);
    preload(index + 1);
  }

  function pauseForUi() {
    playing = false;
    clearTimer();
    updatePlayButton();
    revealUi();
  }

  window.AnnaAlbum = {
    pauseForUi: pauseForUi,
    applySlides: applySlides,
    getSlides: function () {
      return slides.slice();
    },
  };

  fetch(manifestUrl, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("Не удалось прочитать manifest.json (" + res.status + ")");
      return res.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
        throw new Error("В manifest.json нет списка слайдов");
      }
      slides = data.slides.slice();
      if (typeof data.count === "number" && data.count !== slides.length) {
        console.warn(
          "manifest.count=" + data.count + ", slides.length=" + slides.length
        );
      }
      return showFirst();
    })
    .catch(function (err) {
      console.error(err);
      showStatus(
        (err && err.message ? err.message + ". " : "") +
          "Откройте альбом через start_slideshow.bat — прямой запуск HTML-файла может не работать."
      );
    });
})();
