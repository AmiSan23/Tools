/* scripts.js
   Multiple Renamer — core logic
   - Pastikan index.html memuat file ini dengan <script src="scripts.js" defer></script>
   - Optional: include JSZip, FileSaver, SortableJS via CDN untuk fitur lengkap
*/

(() => {
  // ---------- State ----------
  const state = {
    files: [], // {file:File, name:string, ext:string, selected:true}
    options: {
      basedName: '',
      indexSeparator: '_',
      indexStart: 1,
      indexInterval: 1,
      indexPadding: 0,
      capitalization: 'title', // upper, lower, sentence, title
      prefix: '',
      suffix: '',
      dateFormat: '', // e.g. D-M-Y
      timeFormat: '', // e.g. H-m-s
      addText1: '',
      arrayInput: [], // array of strings
      trim: 'none', // none, start, end, all
      replaceFind: '',
      replaceWith: '',
      regexList: [],
      positions: ['prefix','index','based','add1','date','add2','suffix','ext','array']
    }
  };

  // ---------- DOM hooks ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const fileInput = $('#fileInput');
  const fileListEl = $('#fileList');
  const previewListEl = $('#previewList');
  const downloadZipBtn = $('#downloadZipBtn');

  // Options form elements
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

  const selectAllBtn = $('#selectAllBtn');
  const clearBtn = $('#clearBtn');
  const applyBtn = $('#applyBtn');
  const resetBtn = $('#resetBtn');

  // Debounce helper
  function debounce(fn, wait=200){
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(()=>fn(...args), wait);
    };
  }

  // ---------- Utilities ----------
  function splitExt(filename){
    const dot = filename.lastIndexOf('.');
    if(dot === -1) return {base: filename, ext: ''};
    return {base: filename.slice(0,dot), ext: filename.slice(dot+1)};
  }

  function padNumber(num, width){
    const s = String(num);
    if(width <= 0) return s;
    return s.padStart(width, '0');
  }

  function safeRegex(input){
    try {
      return new RegExp(input, 'g');
    } catch (e) {
      return null;
    }
  }

  function titleCase(str){
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
  }

  function sentenceCase(str){
    return str.replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase()).toLowerCase()
              .replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase());
  }

  function applyTrim(str, mode){
    if(mode === 'start') return str.replace(/^\s+/, '');
    if(mode === 'end') return str.replace(/\s+$/, '');
    if(mode === 'all') return str.replace(/\s+/g, '');
    return str;
  }

  function formatDateTokens(formatStr, timeStr){
    // Simple token replacement: D, M, Y, H, m, s
    const now = new Date();
    const tokens = {
      'D': String(now.getDate()).padStart(2,'0'),
      'M': String(now.getMonth()+1).padStart(2,'0'),
      'Y': String(now.getFullYear()),
      'H': String(now.getHours()).padStart(2,'0'),
      'm': String(now.getMinutes()).padStart(2,'0'),
      's': String(now.getSeconds()).padStart(2,'0')
    };
    let out = formatStr || '';
    Object.keys(tokens).forEach(k => {
      out = out.replace(new RegExp(k, 'g'), tokens[k]);
    });
    if(timeStr){
      let t = timeStr;
      Object.keys(tokens).forEach(k => {
        t = t.replace(new RegExp(k, 'g'), tokens[k]);
      });
      out = out ? `${out}${out ? '_' : ''}${t}` : t;
    }
    return out;
  }

  // ---------- Core transform function ----------
  function transformName(originalBase, ext, index, opts){
    // Build components map
    const components = {
      prefix: opts.prefix || '',
      index: '',
      based: opts.basedName || originalBase,
      add1: opts.addText1 || '',
      date: opts.dateFormat ? formatDateTokens(opts.dateFormat, opts.timeFormat) : '',
      add2: '', // reserved
      suffix: opts.suffix || '',
      ext: ext || '',
      array: ''
    };

    // Apply trim/replace/regex to based name if basedName not provided
    if(!opts.basedName){
      let b = components.based;
      b = applyTrim(b, opts.trim);
      if(opts.replaceFind){
        b = b.split(opts.replaceFind).join(opts.replaceWith || '');
      }
      // regex removals
      opts.regexList.forEach(rx => {
        const r = safeRegex(rx);
        if(r) b = b.replace(r, '');
      });
      components.based = b;
    }

    // Array-based naming
    if(Array.isArray(opts.arrayInput) && opts.arrayInput.length){
      const arr = opts.arrayInput;
      const arrVal = arr[index % arr.length] || '';
      components.array = arrVal;
    }

    // Indexing
    if(typeof opts.indexStart === 'number'){
      const idxVal = opts.indexStart + (index * (opts.indexInterval || 1));
      components.index = padNumber(idxVal, opts.indexPadding || 0);
    }

    // Apply capitalization to components that are textual (except ext)
    function applyCap(s){
      if(!s) return s;
      if(opts.capitalization === 'upper') return s.toUpperCase();
      if(opts.capitalization === 'lower') return s.toLowerCase();
      if(opts.capitalization === 'sentence') return sentenceCase(s);
      return titleCase(s);
    }

    // Apply capitalization to based, add1, prefix, suffix, array
    ['based','add1','prefix','suffix','array','add2'].forEach(k => {
      components[k] = applyCap(components[k]);
    });

    // Build final name according to positions
    const parts = [];
    opts.positions.forEach(pos => {
      if(pos === 'index' && components.index){
        parts.push(components.index);
      } else if(pos === 'ext'){
        // extension handled later
      } else {
        const val = components[pos];
        if(val !== undefined && val !== null && String(val) !== ''){
          parts.push(val);
        }
      }
    });

    // Join with separators: use indexSeparator between index and neighbors if index present
    // We'll join with a single separator (space or underscore) — use indexSeparator for index only
    // For simplicity, join with no extra separators, but insert indexSeparator around index
    let final = parts.join('');
    // If index exists and separator defined, replace index occurrence with separator-wrapped
    if(components.index && opts.indexSeparator){
      // find index in final and wrap
      final = final.replace(components.index, `${opts.indexSeparator}${components.index}${opts.indexSeparator}`);
    }

    // Clean up double separators (if any)
    final = final.replace(/_{2,}/g, '_').replace(/\s{2,}/g, ' ').trim();

    // If final empty, fallback to original base
    if(!final) final = components.based || originalBase;

    // Add extension
    const finalExt = opts.extensionsFile && opts.extensionsFile.trim() ? opts.extensionsFile.trim() : components.ext;
    return finalExt ? `${final}.${finalExt}` : final;
  }

  // ---------- Rendering ----------
  function renderFileList(){
    fileListEl.innerHTML = '';
    state.files.forEach((f, idx) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.dataset.index = idx;
      li.innerHTML = `
        <input type="checkbox" ${f.selected ? 'checked' : ''} data-idx="${idx}" />
        <div class="file-meta" style="flex:1;min-width:0;">
          <div class="file-name">${f.name}.${f.ext}</div>
          <div class="file-sub">Size: ${Math.round(f.file.size/1024)} KB</div>
        </div>
      `;
      fileListEl.appendChild(li);
    });
  }

  function renderPreview(){
    previewListEl.innerHTML = '';
    const opts = gatherOptions();
    state.files.forEach((f, idx) => {
      const newName = transformName(f.name, f.ext, idx, opts);
      const li = document.createElement('li');
      li.className = 'preview-item';
      li.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="preview-original">${f.name}.${f.ext}</div>
          <div class="preview-new">${newName}</div>
        </div>
        ${ (newName !== `${f.name}.${f.ext}`) ? '<div class="badge">Changed</div>' : '' }
      `;
      previewListEl.appendChild(li);
    });
  }

  // ---------- Options gathering ----------
  function gatherOptions(){
    const cap = capEls.find(r => r.checked)?.value || 'title';
    const trim = trimEls.find(r => r.checked)?.value || 'none';
    const arrayRaw = (arrayInputEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const regexs = state.options.regexList || [];

    // Merge into options object
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
      extensionsFile: $('#extensionsFile') ? $('#extensionsFile').value : ''
    };

    // Save to state.options for other uses
    state.options = opts;
    return opts;
  }

  // ---------- Event bindings ----------
  // File input
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const {base, ext} = splitExt(f.name);
      state.files.push({file: f, name: base, ext, selected: true});
    });
    renderFileList();
    debouncedPreview();
  });

  // Drag & drop support on upload area (if exists)
  const uploadArea = document.querySelector('.upload') || fileInput.parentElement;
  if(uploadArea){
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
        const {base, ext} = splitExt(f.name);
        state.files.push({file: f, name: base, ext, selected: true});
      });
      renderFileList();
      debouncedPreview();
    });
  }

  // Options change -> preview (debounced)
  const optionInputs = [
    basedNameEl, indexSeparatorEl, indexStartEl, indexIntervalEl, indexPaddingEl,
    prefixEl, suffixEl, dateFormatEl, timeFormatEl, addText1El, arrayInputEl,
    replaceFindEl, replaceWithEl
  ];
  optionInputs.forEach(inp => inp.addEventListener('input', debouncedPreview));

  capEls.forEach(r => r.addEventListener('change', debouncedPreview));
  trimEls.forEach(r => r.addEventListener('change', debouncedPreview));

  // Regex add
  addRegexBtn.addEventListener('click', () => {
    const v = regexInputEl.value.trim();
    if(!v) return;
    const r = safeRegex(v);
    if(!r){
      alert('Regex tidak valid. Periksa sintaks.');
      return;
    }
    state.options.regexList = state.options.regexList || [];
    state.options.regexList.push(v);
    renderRegexList();
    regexInputEl.value = '';
    debouncedPreview();
  });

  function renderRegexList(){
    regexListEl.innerHTML = '';
    (state.options.regexList || []).forEach((r, i) => {
      const span = document.createElement('div');
      span.style.display = 'flex';
      span.style.justifyContent = 'space-between';
      span.style.alignItems = 'center';
      span.style.gap = '8px';
      span.innerHTML = `<div style="font-family:monospace">${r}</div><button class="ghost" data-i="${i}">hapus</button>`;
      regexListEl.appendChild(span);
    });
    // attach delete handlers
    regexListEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.dataset.i);
        state.options.regexList.splice(i,1);
        renderRegexList();
        debouncedPreview();
      });
    });
  }

  // Positions: make draggable if Sortable available
  if(window.Sortable){
    Sortable.create(positionsEl, {
      animation: 150,
      onEnd: () => debouncedPreview()
    });
  } else {
    // fallback: clicking tag toggles order to end
    positionsEl.querySelectorAll('.tag').forEach(tag => {
      tag.addEventListener('click', () => {
        positionsEl.appendChild(tag);
        debouncedPreview();
      });
    });
  }

  // File list interactions (checkbox)
  fileListEl.addEventListener('change', (e) => {
    const cb = e.target;
    if(cb && cb.dataset && cb.dataset.idx){
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
    if(!confirm('Hapus semua file dari daftar?')) return;
    state.files = [];
    renderFileList();
    renderPreview();
  });
  resetBtn.addEventListener('click', () => {
    if(!confirm('Reset semua opsi ke default?')) return;
    // simple reset: reload page or reset state
    location.reload();
  });

  applyBtn.addEventListener('click', () => {
    // For demo: just re-render preview and show a message
    renderPreview();
    alert('Rename applied in preview. Untuk mengganti file sebenarnya, gunakan fitur Download Zip.');
  });

  // Download Zip
  downloadZipBtn.addEventListener('click', async () => {
    if(!state.files.length){
      alert('Tidak ada file untuk diunduh.');
      return;
    }
    if(!window.JSZip || !window.saveAs){
      alert('JSZip atau FileSaver tidak ditemukan. Tambahkan CDN JSZip + FileSaver untuk mengaktifkan fitur ZIP.');
      return;
    }
    const zip = new JSZip();
    const opts = gatherOptions();
    // Add files with new names
    for(let i=0;i<state.files.length;i++){
      const f = state.files[i];
      if(!f.selected) continue;
      const newName = transformName(f.name, f.ext, i, opts);
      const blob = await f.file.arrayBuffer();
      zip.file(newName, blob);
    }
    const content = await zip.generateAsync({type:'blob'});
    saveAs(content, 'renamed_files.zip');
  });

  // ---------- Debounced preview ----------
  const debouncedPreview = debounce(() => {
    gatherOptions();
    renderPreview();
  }, 220);

  // Initial render
  renderFileList();
  renderPreview();

  // Expose for debugging
  window.renamer = {
    state,
    renderPreview,
    transformName,
    gatherOptions
  };

})();

