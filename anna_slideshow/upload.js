(function () {
  "use strict";

  const MAX_FILES = 20;
  const MAX_BYTES = 20 * 1024 * 1024;
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

  const btnOpen = document.getElementById("btnAdd");
  const overlay = document.getElementById("uploadOverlay");
  const fileInput = document.getElementById("uploadFiles");
  const thumbs = document.getElementById("uploadThumbs");
  const countEl = document.getElementById("uploadCount");
  const statusEl = document.getElementById("uploadStatus");
  const btnSave = document.getElementById("uploadSave");
  const btnCancel = document.getElementById("uploadCancel");
  const btnPick = document.getElementById("uploadPick");
  const insertNote = document.getElementById("uploadInsertNote");

  if (!btnOpen || !overlay) return;

  let selected = []; // { file, url }
  let busy = false;

  function api() {
    return window.AnnaAlbum || null;
  }

  function setStatus(text, isError) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function revokeAll() {
    selected.forEach(function (item) {
      if (item.url) URL.revokeObjectURL(item.url);
    });
  }

  function clearSelection() {
    revokeAll();
    selected = [];
    fileInput.value = "";
    render();
  }

  function render() {
    thumbs.innerHTML = "";
    selected.forEach(function (item) {
      const fig = document.createElement("figure");
      fig.className = "upload-thumb";
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.file.name;
      const cap = document.createElement("figcaption");
      cap.textContent = item.file.name;
      fig.appendChild(img);
      fig.appendChild(cap);
      thumbs.appendChild(fig);
    });
    countEl.textContent = selected.length
      ? "Выбрано: " + selected.length
      : "Файлы не выбраны";
    btnSave.disabled = selected.length === 0 || busy;
    insertNote.textContent =
      "По умолчанию новые фото вставляются перед последним слайдом (финальный кадр останется в конце).";
  }

  function openModal() {
    const a = api();
    if (a && a.pauseForUi) a.pauseForUi();
    overlay.hidden = false;
    document.body.classList.add("upload-open", "ui-visible");
    setStatus("");
    render();
  }

  function closeModal() {
    if (busy) return;
    overlay.hidden = true;
    document.body.classList.remove("upload-open");
    clearSelection();
    setStatus("");
  }

  function acceptFile(file) {
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const okType =
      ALLOWED.indexOf(type) >= 0 ||
      /\.(jpe?g|png|webp)$/.test(name);
    if (!okType) return "Неподдерживаемый формат: " + file.name;
    if (file.size > MAX_BYTES) {
      return (
        "Файл больше 20 МБ: " +
        file.name +
        " (" +
        (file.size / 1024 / 1024).toFixed(1) +
        " МБ)"
      );
    }
    return null;
  }

  function onFilesChosen(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    if (files.length > MAX_FILES) {
      setStatus("Можно выбрать не больше " + MAX_FILES + " фотографий.", true);
      return;
    }

    const next = [];
    for (let i = 0; i < files.length; i++) {
      const err = acceptFile(files[i]);
      if (err) {
        setStatus(err, true);
        return;
      }
      next.push({ file: files[i], url: URL.createObjectURL(files[i]) });
    }

    revokeAll();
    selected = next;
    setStatus("");
    render();
  }

  function save() {
    if (busy || !selected.length) return;
    busy = true;
    btnSave.disabled = true;
    btnPick.disabled = true;
    fileInput.disabled = true;
    setStatus("Сохранение… обрабатываю по одной фотографии.");

    const fd = new FormData();
    fd.append("insert_before_last", "1");
    selected.forEach(function (item) {
      fd.append("files", item.file, item.file.name);
    });

    fetch("/api/upload", { method: "POST", body: fd })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.data || !pack.data.ok) {
          throw new Error(
            (pack.data && pack.data.error) ||
              "Не удалось сохранить (код " + pack.res.status + ")"
          );
        }
        const a = api();
        if (a && a.applySlides) {
          a.applySlides(pack.data.slides);
        }
        setStatus(
          "Готово: добавлено " +
            pack.data.added.length +
            ", всего слайдов: " +
            pack.data.count +
            "."
        );
        clearSelection();
        busy = false;
        btnPick.disabled = false;
        fileInput.disabled = false;
        btnSave.disabled = true;
        window.setTimeout(closeModal, 900);
      })
      .catch(function (err) {
        busy = false;
        btnPick.disabled = false;
        fileInput.disabled = false;
        btnSave.disabled = selected.length === 0;
        setStatus(err.message || String(err), true);
      });
  }

  btnOpen.addEventListener("click", function () {
    openModal();
  });
  btnCancel.addEventListener("click", closeModal);
  btnPick.addEventListener("click", function () {
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    onFilesChosen(fileInput.files);
  });
  btnSave.addEventListener("click", save);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (!overlay.hidden && e.code === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });
})();
