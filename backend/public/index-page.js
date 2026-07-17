(function () {
  const LANG_KEY = "cabinetLang";
  const I18N = window.INDEX_I18N || { ru: {}, uz: {} };
  const forcedLang = (() => {
    const v = document.documentElement.dataset.seoLang;
    return v === "ru" || v === "uz" ? v : null;
  })();
  let currentLang = (() => {
    if (forcedLang) return forcedLang;
    try {
      return localStorage.getItem(LANG_KEY) === "uz" ? "uz" : "ru";
    } catch (_e) {
      return "ru";
    }
  })();

  const FEATURE_DATA = {
    1: { descKey: "f1detail", featKey: "f1feat" },
    2: { descKey: "f2detail", featKey: "f2feat" },
    3: { descKey: "f3detail", featKey: "f3feat" },
    4: { descKey: "f4detail", featKey: "f4feat" },
  };
  const siteRoot = (() => {
    const rootPath = document.documentElement.dataset.langUrlRu || "/";
    return rootPath === "/" ? "" : rootPath.replace(/\/$/, "");
  })();

  function setLangButtons() {
    document.getElementById("langRuBtn")?.setAttribute("aria-pressed", String(currentLang === "ru"));
    document.getElementById("langUzBtn")?.setAttribute("aria-pressed", String(currentLang === "uz"));
  }

  function applyLanguage() {
    try {
      document.documentElement.lang = currentLang;
    } catch (_e) {}
    window.INDEX_CURRENT_LANG = currentLang;
    const d = I18N[currentLang] || I18N.ru;
    if (d.pageTitle) document.title = d.pageTitle;
    Object.keys(d).forEach((k) => {
      const el = document.getElementById(k);
      if (el && typeof d[k] === "string") el.textContent = d[k];
    });
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (k && typeof d[k] === "string") el.textContent = d[k];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const k = el.getAttribute("data-i18n-placeholder");
      if (k && d[k]) el.placeholder = d[k];
    });
    [1, 2, 3, 4].forEach((n) => {
      const ul = document.getElementById("f" + n + "featList");
      const featStr = d["f" + n + "feat"] || "";
      const items = featStr ? featStr.split("|").map((s) => s.trim()).filter(Boolean) : [];
      if (ul) {
        ul.innerHTML = items
          .map((s) => "<li>" + String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</li>")
          .join("");
      }
    });
    setLangButtons();
    try {
      window.dispatchEvent(new CustomEvent("indexLangChange", { detail: { lang: currentLang } }));
    } catch (_e) {}
  }

  function setLang(lang) {
    const targetLang = lang === "uz" ? "uz" : "ru";
    const targetUrl =
      document.documentElement.dataset[targetLang === "uz" ? "langUrlUz" : "langUrlRu"] || "";
    currentLang = lang === "uz" ? "uz" : "ru";
    try {
      localStorage.setItem(LANG_KEY, currentLang);
    } catch (_e) {}
    if (targetUrl && location.pathname !== targetUrl) {
      location.href = targetUrl;
      return;
    }
    applyLanguage();
  }

  function openFeatureModal(n) {
    const d = I18N[currentLang] || I18N.ru;
    const fd = FEATURE_DATA[n];
    if (!fd) return;
    const desc = d[fd.descKey] || "";
    const featStr = d[fd.featKey] || "";
    const featList = featStr ? featStr.split("|").map((s) => s.trim()).filter(Boolean) : [];
    document.getElementById("modalTitle").textContent = d["f" + n] || "";
    document.getElementById("modalDesc").textContent = desc;
    document.getElementById("modalFeatList").innerHTML = featList.map((s) => "<li>" + s + "</li>").join("");
    document.getElementById("featureModal").classList.add("open");
  }

  function closeFeatureModal() {
    document.getElementById("featureModal").classList.remove("open");
  }

  function openDemoLoginModal() {
    document.getElementById("demoLoginUsername").value = "demo";
    document.getElementById("demoLoginPassword").value = "demo123";
    const errEl = document.getElementById("demoLoginError");
    if (errEl) {
      errEl.style.display = "none";
      errEl.textContent = "";
    }
    document.getElementById("demoLoginModal").classList.add("open");
  }

  function closeDemoLoginModal() {
    document.getElementById("demoLoginModal").classList.remove("open");
  }

  function setupDemoLightbox() {
    const lightbox = document.getElementById("demoLightbox");
    const lightboxImg = document.getElementById("demoLightboxImg");
    if (!lightbox || !lightboxImg) return;

    function open(src, alt) {
      lightboxImg.src = src;
      lightboxImg.alt = alt || "";
      lightbox.classList.add("open");
    }
    function close() {
      lightbox.classList.remove("open");
      lightboxImg.src = "";
    }

    document.querySelectorAll(".demo-carousel-img").forEach((img) => {
      img.addEventListener("click", () => open(img.currentSrc || img.src, img.alt));
    });
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox || e.target.id === "demoLightboxImg") close();
    });
    document.getElementById("demoLightboxClose")?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("open")) close();
    });
  }

  function setupDemoCarousel() {
    const track = document.getElementById("demoCarouselTrack");
    if (!track) return;
    const slides = Array.from(track.children);
    const dots = Array.from(document.getElementById("demoCarouselDots")?.children || []);
    const prevBtn = document.getElementById("demoCarouselPrev");
    const nextBtn = document.getElementById("demoCarouselNext");
    const carousel = document.getElementById("demoCarousel");
    let idx = 0;
    let timer = null;

    function show(i) {
      idx = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${idx * 100}%)`;
      dots.forEach((d, di) => d.classList.toggle("active", di === idx));
    }
    function next() {
      show(idx + 1);
    }
    function prev() {
      show(idx - 1);
    }
    function startAutoplay() {
      stopAutoplay();
      timer = setInterval(next, 4500);
    }
    function stopAutoplay() {
      if (timer) clearInterval(timer);
    }

    prevBtn?.addEventListener("click", () => {
      prev();
      startAutoplay();
    });
    nextBtn?.addEventListener("click", () => {
      next();
      startAutoplay();
    });
    dots.forEach((d, di) =>
      d.addEventListener("click", () => {
        show(di);
        startAutoplay();
      })
    );
    carousel?.addEventListener("mouseenter", stopAutoplay);
    carousel?.addEventListener("mouseleave", startAutoplay);

    show(0);
    startAutoplay();
  }

  document.getElementById("langRuBtn")?.addEventListener("click", () => setLang("ru"));
  document.getElementById("langUzBtn")?.addEventListener("click", () => setLang("uz"));
  document.getElementById("modalClose")?.addEventListener("click", closeFeatureModal);
  document.getElementById("featureModal")?.addEventListener("click", (e) => {
    if (e.target.id === "featureModal") closeFeatureModal();
  });
  document.querySelectorAll(".feature-card[data-feature]").forEach((card) => {
    card.addEventListener("click", () => openFeatureModal(Number(card.getAttribute("data-feature"))));
  });

  document.getElementById("demoCabinetBtn")?.addEventListener("click", openDemoLoginModal);
  document.getElementById("demoSectionCabinetBtn")?.addEventListener("click", openDemoLoginModal);
  document.getElementById("demoLoginModalClose")?.addEventListener("click", closeDemoLoginModal);
  document.getElementById("demoLoginCancelBtn")?.addEventListener("click", closeDemoLoginModal);
  document.getElementById("demoLoginModal")?.addEventListener("click", (e) => {
    if (e.target.id === "demoLoginModal") closeDemoLoginModal();
  });

  document.getElementById("demoLoginForm")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const username = document.getElementById("demoLoginUsername").value.trim();
    const password = document.getElementById("demoLoginPassword").value;
    const submitBtn = document.getElementById("demoLoginSubmitBtn");
    const d = I18N[currentLang] || I18N.ru;
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = d.demoCabinetLoading || "…";
    try {
      const base = siteRoot;
      const apiBase = `${siteRoot}/api`;
      const r = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.token) {
        setAuthToken(data.token);
        const deptId = data.user?.departmentIds?.[0] ?? data.user?.departmentId;
        const tokenHash = data?.token ? `#authToken=${encodeURIComponent(data.token)}` : "";
        const withToken = (path) => `${base}${path}${tokenHash}`;
        if (data.user?.role === "admin" || data.user?.role === "partner") {
          location.href = withToken("/admin.html");
          return;
        }
        if (data.user?.username === "demo" && deptId) {
          location.href = withToken(`/cabinet-department.html?departmentId=${encodeURIComponent(deptId)}`);
        } else {
          location.href = withToken("/cabinet.html");
        }
        return;
      }
      const errEl = document.getElementById("demoLoginError");
      if (errEl) {
        errEl.textContent = data.error || d.errLogin || "Ошибка входа";
        errEl.style.display = "block";
      }
    } catch (_e) {
      const errEl = document.getElementById("demoLoginError");
      if (errEl) {
        errEl.textContent = d.errConn || "Ошибка соединения. Запустите сервер.";
        errEl.style.display = "block";
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  applyLanguage();
  setupDemoCarousel();
  setupDemoLightbox();
})();
