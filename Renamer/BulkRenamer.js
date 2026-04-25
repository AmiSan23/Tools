/* BulkRenamer.js (fixed)
   Core logic for BulkRenamer.html
   - Main fix: debouncedPreview is declared before any usage
*/

(() => {
  // ---------- State ----------
  const state = {
    files: [],
    options: {
      basedName: '',
      indexSeparator: '_',
      indexStart: 1,
      indexInterval: 1,
      indexPadding: 0,
      capitalization: 'title',
      prefix: '',
      suffix: '',
      dateFormat: '',
      timeFormat: '',
      addText1: '',
      arrayInput: [],
      trim: 'none',
      replaceFind: '',
      replaceWith: '',
      regexList: [],
      positions: ['prefix','index','based','add1','date','add2','suffix','ext','array'],
      extensionsFile: ''
    }
  };

  // ---------- DOM helpers ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const fileInput = $('#fileInput');
  const fileListEl = $('#fileList');
  const previewListEl = $('#previewList');
  const downloadZipBtn = $('#downloadZipBtn');

  // Options elements
  const basedNameEl = $('#basedName');
  const indexSeparatorEl = $('#indexSeparator');
  const indexStartEl = $('#indexStart');
  const indexIntervalEl = $('#indexInterval');
  const indexPaddingEl = $('#indexPadding');
  const capEls = $$('input[name="cap"]');
  const prefixEl = $('#prefix');
  const suffixEl = $('#suffix');
  const dateFormatEl = $('#dateFormat');
  const timeFormatEl = $('#timeFormat');
  const addText1El = $('#addText1');
  const arrayInputEl = $('#arrayInput');
  const trimEls = $$('input[name="trim"]');
  const replaceFindEl = $('#replaceFind');
  const replaceWithEl = $('#replaceWith');
  const regexInputEl = $('#regexInput');
  const addRegexBtn = $('#addRegexBtn');
  const regexListEl = $('#regexList');
  const positionsEl = $('#positions');
  const extensionsFileEl = $('#extensionsFile'); // may be null

  const selectAllBtn = $('#selectAllBtn');
  const clearBtn = $('#clearBtn');
  const applyBtn = $('#applyBtn');
  const resetBtn = $('#resetBtn');

  // ---------- Small utilities ----------
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // --- Move debouncedPreview here so it's available before any listeners use it ---
  const debouncedPreview = debounce(() => {
    gatherOptions();
    renderPreview();
  }, 220);

  function splitExt(filename) {
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return { base: filename, ext: '' };
    return { base: filename.slice(0, dot), ext: filename.slice(dot + 1) };
  }

  function padNumber(num, width) {
    const s = String(num);
    if (!width || width <= 0) return s;
    return s.padStart(width, '0');
  }

  function safeRegex(input) {
    try {
      return new RegExp(input, 'g');
    } catch (e) {
      return null;
    }
  }

  function titleCase(str) {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
  }

  function sentenceCase(str) {
    if (!str) return str;
    const lower = str.toLowerCase();
    return lower.replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase());
  }

  function applyTrim(str, mode) {
    if (mode === 'start') return str.replace(/^\s+/, '');
    if (mode === 'end') return str.replace(/\s+$/, '');
    if (mode === 'all') return str.replace(/\s+/g, '');
    return str;
  }

  function formatDateTokens(formatStr, timeStr) {
    if ((!formatStr || !formatStr.trim()) && (!timeStr || !timeStr.trim())) return '';
    if (window.dayjs) {
      let fmt = formatStr || '';
      fmt = fmt.replace(/\bY\b/g, 'YYYY').replace(/\bD\b/g, 'DD').replace(/\bM\b/g, 'MM');
      let t = timeStr || '';
      t = t.replace(/\bH\b/g, 'HH').replace(/\bm\b/g, 'mm').replace(/\bs\b/g, 'ss');
      const combined = [fmt.trim(), t.trim()].filter(Boolean).join(' ');
      return dayjs().format(combined);
    } else {
      const now = new Date();
      const tokens = {
        'D': String(now.getDate()).padStart(2, '0'),
        'M': String(now.getMonth() + 1).padStart(2, '0'),
        'Y': String(now.getFullYear()),
        'H': String(now.getHours()).padStart(2, '0'),
        'm': String(now.getMinutes()).padStart(2, '0'),
        's': String(now.getSeconds()).padStart(2, '0')
      };
      let out = formatStr || '';
      Object.keys(tokens).forEach(k => {
        out = out.replace(new RegExp(k, 'g'), tokens[k]);
      });
      if (timeStr) {
        let t = timeStr;
        Object.keys(tokens).forEach(k => {
          t = t.replace(new RegExp(k, 'g'), tokens[k]);
        });
        out = out ? `${out}_${t}` : t;
      }
      return out;
    }
  }

  // ---------- Core transform ----------
  function transformName(originalBase, ext, index, opts) {
    const components = {
      prefix: opts.prefix || '',
      index: '',
      based: opts.basedName || originalBase,
      add1: opts.addText1 || '',
      date: opts.dateFormat ? formatDateTokens(opts.dateFormat, opts.timeFormat) : '',
      add2: '',
      suffix: opts.suffix || '',
      ext: ext || '',
      array: ''
    };

    if (!opts.basedName) {
      let b = components.based;
      b = applyTrim(b, opts.trim);
      if (opts.replaceFind) {
        b = b.split(opts.replaceFind).join(opts.replaceWith || '');
      }
      (opts.regexList || []).forEach(rx => {
        const r = safeRegex(rx);
        if (r) b = b.replace(r, '');
      });
      components.based = b;
    }

    if (Array.isArray(opts.arrayInput) && opts.arrayInput.length) {
      const arr = opts.arrayInput;
      const arrVal = arr[index % arr.length] || '';
      components.array = arrVal;
    }

    if (typeof opts.indexStart === 'number') {
      const idxVal = opts.indexStart + (index * (opts.indexInterval || 1));
      components.index = padNumber(idxVal, opts.indexPadding || 0);
    }

    function applyCap(s) {
      if (!s) return s;
      if (opts.capitalization === 'upper') return s.toUpperCase();
      if (opts.capitalization === 'lower') return s.toLowerCase();
      if (opts.capitalization === 'sentence') return sentenceCase(s);
      return titleCase(s);
    }
    ['based', 'add1', 'prefix', 'suffix', 'array', 'add2'].forEach(k => {
      components[k] = applyCap(components[k]);
    });

    const parts = [];
    opts.positions.forEach(pos => {
      if (pos === 'index' && components.index) {
        parts.push({ type: 'index', value: components.index });
      } else if (pos === 'ext') {
        // skip
      } else {
        const val = components[pos];
        if (val !== undefined && val !== null && String(val) !== '') {
          parts.push({ type: 'text', value: String(val) });
        }
      }
    });

    const sep = opts.indexSeparator || '_';
    const joined = parts.map(p => {
      if (p.type === 'index') return `${sep}${p.value}${sep}`;
      return p.value;
    }).join('');

    let final = joined.replace(new RegExp(`${sep}{2,}`, 'g'), sep).replace(/\s{2,}/g, ' ').trim();

    if (!final) final = components.based || originalBase;

    const finalExt = (opts.extensionsFile && opts.extensionsFile.trim()) ? opts.extensionsFile.trim() : components.ext;
    return finalExt ? `${final}.${finalExt}` : final;
  }

  // ---------- Rendering ----------
  function renderFileList() {
    fileListEl.innerHTML = '';
    state.files.forEach((f, idx) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.dataset.index = idx;
      li.innerHTML = `
        <input type="checkbox" ${f.selected ? 'checked' : ''} data-idx="${idx}" />
        <div class="file-meta" style="flex:1;min-width:0;">
          <div class="file-name">${escapeHtml(f.name)}${f.ext ? '.' + escapeHtml(f.ext) : ''}</div>
          <div class="file-sub">Size: ${Math.round(f.file.size / 1024)} KB</div>
        </div>
      `;
      fileListEl.appendChild(li);
    });
  }

  function renderPreview() {
    previewListEl.innerHTML = '';
    const opts = gatherOptions();
    state.files.forEach((f, idx) => {
      const newName = transformName(f.name, f.ext, idx, opts);
      const li = document.createElement('li');
      li.className = 'preview-item';
      li.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="preview-original">${escapeHtml(f.name)}${f.ext ? '.' + escapeHtml(f.ext) : ''}</div>
          <div class="preview-new">${escapeHtml(newName)}</div>
        </div>
        ${ (newName !== `${f.name}${f.ext ? '.' + f.ext : ''}`) ? '<div class="badge">Changed</div>' : '' }
      `;
      previewListEl.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ---------- Options gathering ----------
  function gatherOptions() {
    const cap = capEls.find(r => r.checked)?.value || 'title';
    const trim = trimEls.find(r => r.checked)?.value || 'none';
    const arrayRaw = (arrayInputEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const regexs = state.options.regexList || [];

    const opts = {
      basedName: basedNameEl.value.trim(),
      indexSeparator: indexSeparatorEl.value || '_',
      indexStart: Number(indexStartEl.value) || 0,
      indexInterval: Number(indexIntervalEl.value) || 1,
      indexPadding: Number(indexPaddingEl.value) || 0,
      capitalization: cap,
      prefix: prefixEl.value || '',
      suffix: suffixEl.value || '',
      dateFormat: dateFormatEl.value || '',
      timeFormat: timeFormatEl.value || '',
      addText1: addText1El.value || '',
      arrayInput: arrayRaw,
      trim,
      replaceFind: replaceFindEl.value || '',
      replaceWith: replaceWithEl.value || '',
      regexList: regexs,
      positions: Array.from(positionsEl.querySelectorAll('.tag')).map(t => t.dataset.pos),
      extensionsFile: extensionsFileEl ? (extensionsFileEl.value || '') : ''
    };

    state.options = opts;
    return opts;
  }

  // ---------- Event bindings ----------
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const { base, ext } = splitExt(f.name);
      state.files.push({ file: f, name: base, ext, selected: true });
    });
    renderFileList();
    debouncedPreview();
  });

  const uploadArea = document.querySelector('.upload') || fileInput.parentElement;
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const dtFiles = Array.from(e.dataTransfer.files || []);
      dtFiles.forEach(f => {
        const { base, ext } = splitExt(f.name);
        state.files.push({ file: f, name: base, ext, selected: true });
      });
      renderFileList();
      debouncedPreview();
    });
  }

  // Option inputs -> preview (debounced)
  const optionInputs = [
    basedNameEl, indexSeparatorEl, indexStartEl, indexIntervalEl, indexPaddingEl,
    prefixEl, suffixEl, dateFormatEl, timeFormatEl, addText1El, arrayInputEl,
    replaceFindEl, replaceWithEl
  ].filter(Boolean);
  optionInputs.forEach(inp => inp.addEventListener('input', debouncedPreview));
  capEls.forEach(r => r.addEventListener('change', debouncedPreview));
  trimEls.forEach(r => r.addEventListener('change', debouncedPreview));

  // Regex add
  addRegexBtn.addEventListener('click', () => {
    const v = regexInputEl.value.trim();
    if (!v) return;
    const r = safeRegex(v);
    if (!r) {
      alert('Regex tidak valid. Periksa sintaks.');
      return;
    }
    state.options.regexList = state.options.regexList || [];
    state.options.regexList.push(v);
    renderRegexList();
    regexInputEl.value = '';
    debouncedPreview();
  });

  function renderRegexList() {
    regexListEl.innerHTML = '';
    (state.options.regexList || []).forEach((r, i) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.marginBottom = '6px';
      row.innerHTML = `<div style="font-family:monospace">${escapeHtml(r)}</div><button class="ghost" data-i="${i}" type="button">hapus</button>`;
      regexListEl.appendChild(row);
    });
    regexListEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.dataset.i);
        state.options.regexList.splice(i, 1);
        renderRegexList();
        debouncedPreview();
      });
    });
  }

  // Positions drag/drop via SortableJS if available
  if (window.Sortable) {
    Sortable.create(positionsEl, {
      animation: 150,
      onEnd: () => debouncedPreview()
    });
  } else {
    positionsEl.querySelectorAll('.tag').forEach(tag => {
      tag.addEventListener('click', () => {
        positionsEl.appendChild(tag);
        debouncedPreview();
      });
    });
  }

  // File list checkbox handling
  fileListEl.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb && cb.dataset && cb.dataset.idx) {
      const i = Number(cb.dataset.idx);
      state.files[i].selected = cb.checked;
    }
  });

  // Buttons
  selectAllBtn.addEventListener('click', () => {
    state.files.forEach(f => f.selected = true);
    renderFileList();
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Hapus semua file dari daftar?')) return;
    state.files = [];
    renderFileList();
    renderPreview();
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset semua opsi ke default?')) return;
    location.reload();
  });

  applyBtn.addEventListener('click', () => {
    renderPreview();
    alert('Perubahan diterapkan pada preview. Gunakan Download Zip untuk mengunduh file dengan nama baru.');
  });

  // Download Zip (requires JSZip + FileSaver)
  downloadZipBtn.addEventListener('click', async () => {
    if (!state.files.length) {
      alert('Tidak ada file untuk diunduh.');
      return;
    }
    if (!window.JSZip || !window.saveAs) {
      alert('JSZip atau FileSaver tidak ditemukan. Pastikan CDN library dimuat di HTML.');
      return;
    }
    const zip = new JSZip();
    const opts = gatherOptions();
    for (let i = 0; i < state.files.length; i++) {
      const f = state.files[i];
      if (!f.selected) continue;
      const newName = transformName(f.name, f.ext, i, opts);
      try {
        const buffer = await f.file.arrayBuffer();
        zip.file(newName, buffer);
      } catch (err) {
        console.warn('Gagal membaca file:', f.file.name, err);
      }
    }
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'renamed_files.zip');
    } catch (err) {
      console.error('Gagal membuat ZIP:', err);
      alert('Terjadi kesalahan saat membuat ZIP.');
    }
  });

  // Initial render
  renderFileList();
  renderPreview();

  // Expose for debugging
  window.BulkRenamer = {
    state,
    renderPreview,
    transformName,
    gatherOptions
  };
})();
