// main.js — Full app behavior (auth, entries, mood, PIN, splash, Google fallback)
// Uses Firebase compat SDKs already included in HTML files.
// IMPORTANT: Replace GOOGLE_CLIENT_ID if you plan to use google.accounts (optional).
// Firebase config kept from original file.

const firebaseConfig = {
  apiKey: "AIzaSyDm9HXr1nRRAY68NsJdKyo60HtbeeaKmKw",
  authDomain: "djournal-celma.firebaseapp.com",
  databaseURL: "https://djournal-celma-default-rtdb.firebaseio.com",
  projectId: "djournal-celma",
  storageBucket: "djournal-celma.firebasestorage.app",
  messagingSenderId: "59428337932",
  appId: "1:59428337932:web:1d3882e31a1fc3fa72f129",
  measurementId: "G-54FK9NFY9K"
};
const vapidKey = "BLH2E5pI_45jlSWs9nJMIE1IfwLcQwxuKGXL4n7ZAhLR9OI30EjWhcO66weIzZgrLlIpzkmq0c-pwyJ_JO4eMw8";
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"; // optional, replace if needed

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let messaging = null;
try { messaging = firebase.messaging(); } catch (e) { /* optional */ }

// Small DOM helpers
const $ = (s, el = document) => (el || document).querySelector(s);
const $$ = (s, el = document) => Array.from((el || document).querySelectorAll(s));
function toast(msg, t = 2500) {
  let el = document.getElementById('mj-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mj-toast';
    el.style = 'position:fixed;left:50%;transform:translateX(-50%);bottom:22px;padding:12px 16px;border-radius:10px;background:rgba(0,0,0,0.8);color:#fff;z-index:450;transition:opacity .3s;font-weight:700';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', t);
}
function showError(msg) { console.error(msg); toast(msg || 'An error occurred'); }
function param(name) { const u = new URL(location.href); return u.searchParams.get(name); }
function stripHtml(html) { const tmp = document.createElement('div'); tmp.innerHTML = html || ''; return tmp.textContent || tmp.innerText || ''; }
function tsToString(ts) { if (!ts) return ''; const d = ts && ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(); }

// bindOne helper
const __bound = new WeakMap();
function bindOnce(el, ev, fn) {
  if (!el) return;
  let map = __bound.get(el);
  if (!map) { map = {}; __bound.set(el, map); }
  if (map[ev]) return;
  el.addEventListener(ev, fn);
  map[ev] = true;
}

// ---------- Splash behavior ----------
function showSplashIfNeeded(uid) {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  const key = 'mj_first_login_' + (uid || 'guest');
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, '1');
    splash.classList.remove('hidden');
    setTimeout(() => splash.classList.add('hidden'), 5000);
  } else {
    splash.classList.add('hidden');
  }
}

// ---------- Google sign-in fallback (Firebase popup) ----------
async function signInWithGooglePopup() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    if (!user) return;
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      await db.collection('users').doc(user.uid).set({
        username: user.displayName || (user.email ? user.email.split('@')[0] : ''),
        email: user.email || '',
        avatar: user.photoURL || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    localStorage.setItem('mj_remember_login', '1');
    location.href = 'home.html';
  } catch (err) {
    console.error('Google sign-in error', err);
    showError(err.message || 'Google sign-in failed');
  }
}

// ---------- Auth persistence helper ----------
async function setAuthPersistence(remember) {
  try {
    if (remember) await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    else await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  } catch (e) {
    console.warn('setPersistence failed', e);
  }
}

// ---------- Auth state watcher ----------
let currentUser = null, userProfile = null;
auth.onAuthStateChanged(async (u) => {
  try {
    if (!u) {
      // If on protected pages, redirect to login.
      const protectedPages = ['home.html', 'mood.html', 'settings.html', 'edit.html', 'preview.html', 'pin.html'];
      if (protectedPages.some(p => location.pathname.endsWith(p))) {
        window.location.href = 'index.html';
      }
      return;
    }
    currentUser = u;
    const doc = await db.collection('users').doc(u.uid).get().catch(() => null);
    userProfile = doc && doc.exists ? doc.data() : { username: u.email ? u.email.split('@')[0] : '' };

    // Show splash on first login per device
    showSplashIfNeeded(u.uid);

    // If on auth pages, redirect to home
    if (location.pathname.endsWith('index.html') || location.pathname.endsWith('signup.html') || location.pathname === '/') {
      location.href = 'home.html';
    }
  } catch (err) {
    console.error('auth state change error', err);
  }
});

// ---------- DOM ready bindings (populate, attach handlers) ----------
document.addEventListener('DOMContentLoaded', () => {
  // Populate signup age reliably
  const ageSel = document.getElementById('signup-age');
  if (ageSel && ageSel.children.length <= 1) {
    for (let i = 13; i <= 70; i++) {
      const o = document.createElement('option'); o.value = i; o.textContent = i; ageSel.appendChild(o);
    }
  }

  // LOGIN page handlers
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    bindOnce(loginForm, 'submit', async (e) => {
      e.preventDefault();
      try {
        const email = (document.getElementById('login-email') || {}).value || '';
        const password = (document.getElementById('login-password') || {}).value || '';
        const remember = !!(document.getElementById('remember-login') && document.getElementById('remember-login').checked);
        await setAuthPersistence(remember);
        await auth.signInWithEmailAndPassword(email, password);
        if (remember) localStorage.setItem('mj_remember_login', '1');
        location.href = 'home.html';
      } catch (err) {
        console.error(err);
        showError(err.message || 'Login failed');
      }
    });

    // password toggle
    const loginShow = document.getElementById('login-showpass'), loginPass = document.getElementById('login-password');
    if (loginShow && loginPass) bindOnce(loginShow, 'click', () => { loginPass.type = loginPass.type === 'password' ? 'text' : 'password'; loginShow.textContent = loginPass.type === 'password' ? 'Show' : 'Hide'; });

    // Google fallback button
    const gbtn = document.getElementById('google-signin-button');
    if (gbtn) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-google';
      btn.innerHTML = '<span class="google-icon">G</span><span>Continue with Google</span>';
      btn.style.width = '100%';
      bindOnce(btn, 'click', (ev) => { ev.preventDefault(); signInWithGooglePopup(); });
      gbtn.appendChild(btn);
    }

    // forgot password modal
    const resetModal = document.getElementById('reset-modal');
    const forgotLink = document.getElementById('forgot-link'), resetClose = document.getElementById('reset-close'), resetSend = document.getElementById('reset-send');
    if (forgotLink) bindOnce(forgotLink, 'click', (e) => { e.preventDefault(); if (resetModal) resetModal.classList.remove('hidden'); });
    if (resetClose) bindOnce(resetClose, 'click', () => resetModal.classList.add('hidden'));
    if (resetSend) bindOnce(resetSend, 'click', async () => {
      const email = (document.getElementById('reset-email') || {}).value.trim();
      if (!email) return showError('Enter an email address');
      try {
        await auth.sendPasswordResetEmail(email);
        toast('Reset link sent');
        resetModal.classList.add('hidden');
        document.getElementById('reset-email').value = '';
      } catch (err) { showError(err.message || 'Unable to send reset link'); }
    });
  }

  // SIGNUP page handlers
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    bindOnce(signupForm, 'submit', async (e) => {
      e.preventDefault();
      try {
        const username = (document.getElementById('signup-username') || {}).value.trim();
        const age = (document.getElementById('signup-age') || {}).value;
        const gender = (document.getElementById('signup-gender') || {}).value;
        const email = (document.getElementById('signup-email') || {}).value.trim();
        const password = (document.getElementById('signup-password') || {}).value || '';
        if (!username || !age || !gender || !email || !password) return showError('Please fill all required fields');
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        await db.collection('users').doc(uid).set({
          username, age: Number(age), gender, email,
          pinEnabled: false, twoFaEnabled: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        localStorage.setItem('mj_remember_login', '1');
        location.href = 'home.html';
      } catch (err) {
        console.error(err);
        showError(err.message || 'Sign up failed');
      }
    });

    // show/hide password
    const signupShow = document.getElementById('signup-showpass'), signupPass = document.getElementById('signup-password');
    if (signupShow && signupPass) bindOnce(signupShow, 'click', () => { signupPass.type = signupPass.type === 'password' ? 'text' : 'password'; signupShow.textContent = signupPass.type === 'password' ? 'Show' : 'Hide'; });

    // google fallback button
    const gbtn2 = document.getElementById('google-signup-button');
    if (gbtn2) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-google';
      btn.innerHTML = '<span class="google-icon">G</span><span>Continue with Google</span>';
      btn.style.width = '100%';
      bindOnce(btn, 'click', (ev) => { ev.preventDefault(); signInWithGooglePopup(); });
      gbtn2.appendChild(btn);
    }

    // Notification modal (optional)
    const notifyYes = document.getElementById('notify-yes');
    if (notifyYes) bindOnce(notifyYes, 'click', async () => {
      // Attempt to request notifications quickly (best-effort)
      try {
        if (messaging && Notification && Notification.requestPermission) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            toast('Notifications enabled (browser)');
          } else {
            toast('Notifications not granted');
          }
        } else {
          toast('Notification not supported here');
        }
      } catch (e) { console.error(e); showError('Unable to enable notifications'); }
      document.getElementById('notify-modal') && document.getElementById('notify-modal').classList.add('hidden');
    });
    const notifyNo = document.getElementById('notify-no');
    if (notifyNo) bindOnce(notifyNo, 'click', () => { document.getElementById('notify-modal') && document.getElementById('notify-modal').classList.add('hidden'); });
  }

  // Fix: hide splash if not first load
  try { const splash = document.getElementById('splash-screen'); if (splash) splash.classList.add('hidden'); } catch (e) {}
});

// ---------- Home page & entries ----------
if (document.querySelector('.page-app')) {
  // local cache of entries to enable fast client-side search/filter
  let entriesCache = [];

  // executed when auth ready; use onAuthReady by watching auth state
  auth.onAuthStateChanged(async (u) => {
    if (!u) return;
    const currentUser = u;
    // welcome title
    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      const userProfile = doc.exists ? doc.data() : { username: currentUser.email.split('@')[0] };
      $('#welcome-title') && ($('#welcome-title').textContent = `Welcome ${userProfile.username || ''}`);
    } catch (e) { /* ignore */ }

    // bind hamburger and signout
    const hb = document.getElementById('hamburger-btn'), side = document.getElementById('side-menu');
    if (hb && side) {
      bindOnce(hb, 'click', () => { const open = !side.classList.contains('hidden'); if (open) { side.classList.add('hidden'); hb.setAttribute('aria-expanded','false'); } else { side.classList.remove('hidden'); hb.setAttribute('aria-expanded','true'); } });
      side.querySelectorAll('a.menu-item, button.menu-item').forEach(mi => bindOnce(mi, 'click', () => { side.classList.add('hidden'); hb.setAttribute('aria-expanded','false'); }));
      bindOnce(document, 'click', (ev) => { if (!side || side.classList.contains('hidden')) return; const path = ev.composedPath ? ev.composedPath() : (ev.path || []); if (path.includes(side) || path.includes(hb)) return; side.classList.add('hidden'); hb.setAttribute('aria-expanded','false'); });
    }
    // signout
    bindOnce(document, 'click', async (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest('#signout-btn') : null;
      if (!el) return;
      ev.preventDefault();
      try { await auth.signOut(); localStorage.removeItem('mj_remember_login'); location.href = 'index.html'; } catch (err) { showError('Unable to sign out'); }
    });

    // entries listener
    let unsub = null;
    try {
      const q = db.collection('users').doc(currentUser.uid).collection('entries').orderBy('createdAt', 'desc');
      unsub = q.onSnapshot(snapshot => {
        const docs = [];
        snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
        entriesCache = docs; // update local cache
        renderEntries(); // render from the cache (search will be applied)
      }, err => { console.error(err); showError('Failed to load entries'); });
    } catch (e) { console.error(e); showError('Unable to listen for entries'); }

    // search binding
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let timer = null;
      const handler = () => { clearTimeout(timer); timer = setTimeout(() => { renderEntries(); }, 180); };
      searchInput.addEventListener('input', handler);
      searchInput.addEventListener('search', handler);
      // Enter triggers immediate search
      searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); renderEntries(); } });
    }

    // add entry button
    const addBtn = document.getElementById('add-entry-btn');
    if (addBtn) bindOnce(addBtn, 'click', () => location.href = 'edit.html');

    // renderEntries function uses entriesCache
    function renderEntries() {
      const entriesListEl = document.getElementById('entries-list');
      if (!entriesListEl) return;
      const qv = (document.getElementById('search-input') && document.getElementById('search-input').value) ? (document.getElementById('search-input').value || '').trim().toLowerCase() : '';
      const filtered = entriesCache.filter(en => {
        if (!qv) return true;
        const t = ((en.title || '') + ' ' + (stripHtml(en.content) || '')).toLowerCase();
        return t.includes(qv);
      });
      entriesListEl.innerHTML = '';
      if (!filtered.length) { entriesListEl.innerHTML = '<p class="small-note" style="color:var(--muted)">No entries yet</p>'; return; }
      filtered.forEach(en => {
        const fullText = stripHtml(en.content || '');
        const snippet = fullText.slice(0, 120); // show a longer snippet for better search UX
        const needsToggle = fullText.length > 120;
        const div = document.createElement('div'); div.className = 'entry-item';
        div.innerHTML = `
          <div class="entry-left">
            <div class="entry-title"><a href="preview.html?id=${encodeURIComponent(en.id)}">${(en.title || '(No title)')}</a></div>
            <div class="entry-snippet" data-full="${fullText}">${snippet}${needsToggle ? '…' : ''}${needsToggle ? ' <span class="more-toggle" role="button" tabindex="0">Read more</span>' : ''}</div>
            <div class="entry-meta">${tsToString(en.updatedAt || en.createdAt)}</div>
          </div>`;
        entriesListEl.appendChild(div);

        if (needsToggle) {
          const snippetEl = div.querySelector('.entry-snippet');
          const toggleEl = snippetEl.querySelector('.more-toggle');
          if (toggleEl) {
            bindOnce(toggleEl, 'click', (ev) => {
              ev.preventDefault();
              const full = snippetEl.getAttribute('data-full') || '';
              snippetEl.innerHTML = `${full} <span class="more-toggle" role="button" tabindex="0">Show less</span>`;
              const newToggle = snippetEl.querySelector('.more-toggle');
              bindOnce(newToggle, 'click', (e) => {
                e.preventDefault();
                snippetEl.innerHTML = `${snippet}… <span class="more-toggle" role="button" tabindex="0">Read more</span>`;
              });
            });
            bindOnce(toggleEl, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEl.click(); } });
          }
        }
      });
    }
  });
}

// ---------- Edit page ----------
if (location.pathname.endsWith('edit.html')) {
  auth.onAuthStateChanged(async (u) => {
    if (!u) { location.href = 'index.html'; return; }
    const currentUser = u;
    const id = param('id');
    const titleInput = document.getElementById('entry-title'), contentEl = document.getElementById('entry-content');
    const saveBtn = document.getElementById('save-entry'), cancelBtn = document.getElementById('cancel-entry');
    const toolbarBtns = document.querySelectorAll('.editor-toolbar button');

    if (id) {
      try {
        const doc = await db.collection('users').doc(currentUser.uid).collection('entries').doc(id).get();
        if (doc.exists) { const d = doc.data(); titleInput.value = d.title || ''; contentEl.innerHTML = d.content || ''; }
      } catch (err) { console.error(err); showError('Unable to load entry'); }
    }

    toolbarBtns.forEach(btn => bindOnce(btn, 'mousedown', (ev) => {
      ev.preventDefault();
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      try { document.execCommand(cmd, false, null); contentEl.focus(); } catch (e) { console.error(e); showError('Formatting failed'); }
    }));

    let isSaving = false;
    bindOnce(saveBtn, 'click', async () => {
      if (isSaving) return;
      isSaving = true; saveBtn.setAttribute('disabled', 'true');
      const title = titleInput.value.trim();
      const content = contentEl.innerHTML.trim();
      if (!content) { showError('Entry content cannot be empty'); isSaving = false; saveBtn.removeAttribute('disabled'); return; }
      const now = firebase.firestore.FieldValue.serverTimestamp();
      try {
        const ref = db.collection('users').doc(currentUser.uid).collection('entries');
        if (id) { await ref.doc(id).update({ title, content, updatedAt: now }); toast('Updated'); }
        else { await ref.add({ title, content, createdAt: now, updatedAt: now }); toast('Saved'); }
        location.href = 'home.html';
      } catch (err) { console.error(err); showError(err.message || 'Unable to save entry'); } finally { isSaving = false; saveBtn.removeAttribute('disabled'); }
    });

    bindOnce(cancelBtn, 'click', () => location.href = 'home.html');
  });
}

// ---------- Preview page ----------
if (location.pathname.endsWith('preview.html')) {
  auth.onAuthStateChanged(async (u) => {
    if (!u) { location.href = 'index.html'; return; }
    const currentUser = u;
    const id = param('id');
    const previewTitle = document.getElementById('preview-title'), previewContent = document.getElementById('preview-content'), previewMeta = document.getElementById('preview-meta'), editLink = document.getElementById('edit-link'), deleteBtn = document.getElementById('delete-entry');
    if (!id) { showError('Missing entry id'); location.href = 'home.html'; return; }
    try {
      const doc = await db.collection('users').doc(currentUser.uid).collection('entries').doc(id).get();
      if (!doc.exists) { showError('Entry not found'); location.href = 'home.html'; return; }
      const d = doc.data();
      previewTitle.textContent = d.title || '(No title)';
      previewContent.innerHTML = d.content || '';
      previewMeta.textContent = tsToString(d.updatedAt || d.createdAt);
      if (editLink) editLink.setAttribute('href', `edit.html?id=${id}`);
    } catch (err) { console.error(err); showError('Unable to load entry'); }

    if (deleteBtn) bindOnce(deleteBtn, 'click', () => {
      if (!confirm('Delete this entry?')) return;
      db.collection('users').doc(currentUser.uid).collection('entries').doc(id).delete().then(() => { toast('Deleted'); location.href = 'home.html'; }).catch(err => showError('Unable to delete'));
    });
  });
}

// ---------- Mood page ----------
if (document.querySelector('.page-mood')) {
  auth.onAuthStateChanged(async (u) => {
    if (!u) { location.href = 'index.html'; return; }
    const currentUser = u;
    bindOnce(document.getElementById('hamburger-btn'), 'click', () => { const side = document.getElementById('side-menu'); if (side) side.classList.toggle('hidden'); });

    const moodBtns = document.querySelectorAll('.mood-btn'), moodDesc = document.getElementById('mood-desc'), saveMoodBtn = document.getElementById('save-mood'), moodsListEl = document.getElementById('moods-list');
    let selectedMoodValue = null;
    moodBtns.forEach(b => bindOnce(b, 'click', () => {
      moodBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      selectedMoodValue = Number(b.dataset.value);
    }));

    // helper to update analytics and list quickly (optimistic)
    function updateMoodAnalyticsAndList(arr) {
      if (!document.getElementById('total-entries')) return;
      document.getElementById('total-entries').textContent = arr.length;
      const values = arr.slice(0, 7).map(x => x.value || 3);
      const avg = values.length ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(1) : '-';
      document.getElementById('week-avg').textContent = avg;
      document.getElementById('today-mood').textContent = arr.length ? (arr[0].value || '-') : '-';
      // streak: count consecutive days from latest
      let streak = 0;
      if (arr.length) {
        const today = new Date(); let prevDay = null;
        for (let i=0;i<arr.length;i++) {
          const d = arr[i].createdAt && arr[i].createdAt.toDate ? arr[i].createdAt.toDate() : new Date(arr[i].createdAt);
          const daysDiff = prevDay ? Math.round((prevDay - d)/(1000*60*60*24)) : 0;
          if (i===0) { streak = 1; prevDay = d; }
          else if (daysDiff <= 1) { streak++; prevDay = d; } else break;
        }
      }
      document.getElementById('streak-days').textContent = streak;

      // chart: simple bars for last 7 values
      const chart = document.getElementById('mood-chart'); if (!chart) return;
      chart.innerHTML = '';
      const last7 = arr.slice(0,7).reverse();
      const max = 5;
      last7.forEach(item => {
        const h = ((item.value || 3)/max) * 100;
        const bar = document.createElement('div'); bar.className = 'mood-bar'; bar.style.height = `${Math.max(8, h)}%`; chart.appendChild(bar);
      });
    }

    let localMoods = []; // local copy for optimistic updates

    // Save mood (optimistic UI)
    bindOnce(saveMoodBtn, 'click', async () => {
      if (!selectedMoodValue) return showError('Please select a mood');
      const desc = (moodDesc && moodDesc.value) ? moodDesc.value.trim() : '';
      saveMoodBtn.setAttribute('disabled', 'true');
      const newMood = {
        emoji: document.querySelector('.mood-btn.active') ? document.querySelector('.mood-btn.active').dataset.emoji : '',
        value: selectedMoodValue,
        description: desc,
        createdAt: new Date(), // local timestamp for optimistic UI
        updatedAt: new Date()
      };
      try {
        // optimistic add to UI
        localMoods.unshift({ id: 'local-' + Date.now(), ...newMood });
        // render list optimistically
        renderMoodsList(localMoods);

        // write to Firestore
        const ref = db.collection('users').doc(currentUser.uid).collection('moods');
        const writeRes = await ref.add({
          emoji: newMood.emoji,
          value: newMood.value,
          description: newMood.description,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // after write, server snapshot listener (below) will update the UI;
        if (moodDesc) moodDesc.value = '';
        selectedMoodValue = null; moodBtns.forEach(x => x.classList.remove('active'));
        toast('Mood recorded');
      } catch (err) {
        console.error(err);
        // rollback optimistic state and show error
        localMoods = localMoods.filter(m => !m.id.startsWith('local-'));
        renderMoodsList(localMoods);
        showError('Unable to record mood');
      } finally {
        saveMoodBtn.removeAttribute('disabled');
      }
    });

    // helper to render moods list from an array (from snapshot or local)
    function renderMoodsList(arr) {
      if (!moodsListEl) return;
      moodsListEl.innerHTML = '';
      if (!arr.length) { moodsListEl.innerHTML = '<p class="small-note" style="color:var(--muted)">No moods yet</p>'; return; }
      arr.forEach(m => {
        const el = document.createElement('div'); el.className = 'entry-item';
        el.innerHTML = `<div style="font-size:22px;display:inline-block;margin-right:8px">${m.emoji || ''}</div>
          <div style="display:inline-block;vertical-align:top;width:72%"><div class="entry-snippet">${(m.description||'')}</div><div class="entry-meta">${tsToString(m.updatedAt||m.createdAt)}</div></div>
          <div style="text-align:right"><button class="btn small" data-id="${m.id}">Delete</button></div>`;
        const delBtn = el.querySelector('button');
        // deletion will call Firestore; for optimistic UX, disable button after click
        bindOnce(delBtn, 'click', () => {
          if (!confirm('Delete this mood record?')) return;
          delBtn.setAttribute('disabled', 'true');
          // If it's a local optimistic entry, just remove locally
          if (String(m.id).startsWith('local-')) {
            localMoods = localMoods.filter(x => x.id !== m.id);
            renderMoodsList(localMoods);
            toast('Deleted');
            return;
          }
          db.collection('users').doc(currentUser.uid).collection('moods').doc(m.id).delete().then(() => toast('Deleted')).catch(() => { showError('Unable to delete mood'); delBtn.removeAttribute('disabled'); });
        });
        moodsListEl.appendChild(el);
      });
    }

    // listen to moods and render analytics
    const q = db.collection('users').doc(currentUser.uid).collection('moods').orderBy('createdAt', 'desc');
    q.onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      // merge server data with any local optimistic entries (local entries are at start)
      localMoods = localMoods.filter(m => m.id && String(m.id).startsWith('local-')); // keep only locals
      const combined = [...localMoods, ...arr];
      renderMoodsList(combined);
      updateMoodAnalyticsAndList(arr);
    }, err => { console.error(err); showError('Failed to load moods'); });
  });
}

// ---------- Settings page (pin, email change, 2FA scaffolding) ----------
if (document.querySelector('.page-settings')) {
  auth.onAuthStateChanged(async (u) => {
    if (!u) { location.href='index.html'; return; }
    const currentUser = u;

    // load current profile
    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      const userProfile = doc.exists ? doc.data() : {};
      if (userProfile.username) document.getElementById('settings-username').value = userProfile.username;
      if (currentUser.email) document.getElementById('settings-email').value = currentUser.email;
      const pinEnabled = !!userProfile.pinEnabled;
      document.getElementById('pin-status-text').textContent = pinEnabled ? 'PIN is enabled' : 'PIN not set';
      document.getElementById('disable-pin-btn').style.display = pinEnabled ? 'inline-flex' : 'none';
      document.getElementById('pin-setup').style.display = 'none';
      // 2FA status
      document.getElementById('twofa-status-text').textContent = userProfile.twoFaEnabled ? 'Enabled' : 'Not enabled';
      document.getElementById('backup-codes-section').style.display = userProfile.backupCodes ? 'block' : 'none';
      if (userProfile.backupCodes) document.getElementById('backup-codes-list').textContent = (userProfile.backupCodes || []).join('\n');
    } catch (e) { console.error(e); }

    // wire Change email button to show the email-change modal
    const changeEmailBtn = document.getElementById('change-email-btn');
    const emailChangeModal = document.getElementById('email-change-modal');
    const emailChangeCancel = document.getElementById('email-change-cancel');
    const emailChangeSend = document.getElementById('email-change-send');

    if (changeEmailBtn && emailChangeModal) bindOnce(changeEmailBtn, 'click', (e) => {
      e.preventDefault();
      emailChangeModal.classList.remove('hidden');
      const newEmailInput = document.getElementById('new-email-input');
      if (newEmailInput) newEmailInput.value = document.getElementById('settings-email').value || '';
    });
    if (emailChangeCancel && emailChangeModal) bindOnce(emailChangeCancel, 'click', () => emailChangeModal.classList.add('hidden'));
    if (emailChangeSend && emailChangeModal) bindOnce(emailChangeSend, 'click', async () => {
      const newEmailInput = document.getElementById('new-email-input');
      const newEmail = (newEmailInput && newEmailInput.value || '').trim();
      if (!newEmail) return showError('Enter a new email address');
      // create verification code and show verification modal
      const code = Math.floor(100000 + Math.random()*900000).toString();
      sessionStorage.setItem('verification_code', code);
      sessionStorage.setItem('verification_email', newEmail);
      console.log('Verification code (DEV):', code);
      emailChangeModal.classList.add('hidden');
      // open verification modal to complete flow
      const vmodal = document.getElementById('verification-modal');
      if (vmodal) vmodal.classList.remove('hidden');
      toast('Verification code sent (dev console)');
    });

    // Save settings (username, email, password)
    bindOnce(document.getElementById('save-settings'), 'click', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('save-settings');
      btn.setAttribute('disabled', 'true');
      try {
        const newUser = (document.getElementById('settings-username') || {}).value.trim();
        const newEmail = (document.getElementById('settings-email') || {}).value.trim();
        const newPw = (document.getElementById('settings-password') || {}).value || '';
        if (newUser) await db.collection('users').doc(currentUser.uid).update({ username: newUser, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        if (newEmail && newEmail !== currentUser.email) {
          // start verification: create code and store in sessionStorage (in production send real email)
          const code = Math.floor(100000 + Math.random()*900000).toString();
          sessionStorage.setItem('verification_code', code);
          sessionStorage.setItem('verification_email', newEmail);
          console.log('Verification code (DEV):', code); // for dev
          const vmodal = document.getElementById('verification-modal');
          if (vmodal) vmodal.classList.remove('hidden');
          toast('Verification required to change email (dev console)');
        }
        if (newPw) await currentUser.updatePassword(newPw);
        toast('Settings saved');
        document.getElementById('settings-password').value = '';
      } catch (err) { console.error(err); showError(err.message || 'Unable to save settings'); } finally { btn.removeAttribute('disabled'); }
    });

    // Email Verification modal bindings
    const vmodal = document.getElementById('verification-modal');
    if (vmodal) {
      const inputs = Array.from(vmodal.querySelectorAll('.code-digit'));
      inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => { if (e.target.value && idx < inputs.length -1) inputs[idx+1].focus(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !e.target.value && idx > 0) inputs[idx-1].focus(); });
      });
      bindOnce(document.getElementById('verify-back'), 'click', () => { vmodal.classList.add('hidden'); vmodal.querySelectorAll('.code-digit').forEach(i=>i.value=''); });
      bindOnce(document.getElementById('verify-submit'), 'click', async () => {
        const code = Array.from(vmodal.querySelectorAll('.code-digit')).map(i=>i.value).join('');
        const saved = sessionStorage.getItem('verification_code');
        if (code === saved) {
          const newEmail = sessionStorage.getItem('verification_email');
          try {
            await currentUser.updateEmail(newEmail);
            await db.collection('users').doc(currentUser.uid).update({ email: newEmail });
            sessionStorage.removeItem('verification_code'); sessionStorage.removeItem('verification_email');
            vmodal.classList.add('hidden');
            toast('Email updated successfully');
            document.getElementById('settings-email').value = newEmail;
          } catch (err) { showError(err.message || 'Email update failed'); }
        } else { showError('Invalid verification code'); vmodal.querySelectorAll('.code-digit').forEach(i=>i.value=''); }
      });
    }

    // PIN setup toggles
    bindOnce(document.getElementById('enable-pin-btn'), 'click', () => { document.getElementById('pin-setup').style.display = 'block'; });
    bindOnce(document.getElementById('cancel-pin'), 'click', () => { document.getElementById('pin-setup').style.display = 'none'; });
    bindOnce(document.getElementById('save-pin'), 'click', async () => {
      const savePinBtn = document.getElementById('save-pin');
      savePinBtn.setAttribute('disabled', 'true');
      const p1 = (document.getElementById('new-pin') || {}).value || '';
      const p2 = (document.getElementById('confirm-pin') || {}).value || '';
      const mode = (document.getElementById('pin-lock-mode') || {}).value || 'immediate';
      if (!p1 || p1.length !== 4 || p1 !== p2) { showError('Enter a matching 4-digit PIN'); savePinBtn.removeAttribute('disabled'); return; }
      try {
        await db.collection('users').doc(currentUser.uid).update({ pin: p1, pinEnabled: true, pinLockMode: mode });
        toast('PIN enabled');
        document.getElementById('pin-status-text').textContent = 'PIN is enabled';
        document.getElementById('disable-pin-btn').style.display = 'inline-flex';
        document.getElementById('pin-setup').style.display = 'none';
      } catch (err) { console.error(err); showError('Unable to enable PIN'); } finally { savePinBtn.removeAttribute('disabled'); }
    });
    bindOnce(document.getElementById('disable-pin-btn'), 'click', async () => {
      const btn = document.getElementById('disable-pin-btn');
      btn.setAttribute('disabled', 'true');
      try {
        await db.collection('users').doc(currentUser.uid).update({ pinEnabled: false, pin: firebase.firestore.FieldValue.delete() });
        document.getElementById('pin-status-text').textContent = 'PIN not set';
        document.getElementById('disable-pin-btn').style.display = 'none';
        toast('PIN disabled');
      } catch (err) { showError('Unable to disable PIN'); } finally { btn.removeAttribute('disabled'); }
    });

    // 2FA scaffolding: generate secret and backup codes (for demo)
    bindOnce(document.getElementById('enable-2fa-btn'), 'click', async () => {
      const btn = document.getElementById('enable-2fa-btn');
      btn.setAttribute('disabled', 'true');
      try {
        const secret = generateSecret();
        const backupCodes = generateBackupCodes();
        // store to user doc
        await db.collection('users').doc(currentUser.uid).update({ twoFaEnabled: true, twoFaSecret: secret, backupCodes });
        document.getElementById('twofa-secret').textContent = secret;
        document.getElementById('backup-codes-list').textContent = backupCodes.join('\n');
        document.getElementById('backup-codes-section').style.display = 'block';
        document.getElementById('twofa-setup').style.display = 'block';
        document.getElementById('twofa-status-text').textContent = 'Enabled';
        document.getElementById('disable-2fa-btn').style.display = 'inline-flex';
        toast('2FA setup (demo) - save backup codes');
      } catch (err) { console.error(err); showError('Unable to setup 2FA'); } finally { btn.removeAttribute('disabled'); }
    });
    bindOnce(document.getElementById('cancel-2fa'), 'click', () => { document.getElementById('twofa-setup').style.display = 'none'; });
    bindOnce(document.getElementById('copy-backup-codes'), 'click', async () => {
      const text = document.getElementById('backup-codes-list').textContent || '';
      try { await navigator.clipboard.writeText(text); toast('Backup codes copied'); } catch (e) { showError('Copy failed'); }
    });

    // Account delete (reauth)
    bindOnce(document.getElementById('delete-account'), 'click', () => { document.getElementById('reauth-modal').classList.remove('hidden'); });
    bindOnce(document.getElementById('reauth-cancel'), 'click', () => { document.getElementById('reauth-modal').classList.add('hidden'); document.getElementById('reauth-password').value=''; });
    bindOnce(document.getElementById('reauth-confirm'), 'click', async () => {
      const pw = (document.getElementById('reauth-password') || {}).value || '';
      if (!pw) return showError('Enter your current password');
      try {
        const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
        await currentUser.reauthenticateWithCredential(cred);
        // delete user doc and account
        await db.collection('users').doc(currentUser.uid).delete().catch(()=>{});
        await currentUser.delete();
        toast('Account deleted');
        location.href = 'index.html';
      } catch (err) { showError(err.message || 'Unable to delete account (check password)'); }
    });
  });
}

// ---------- PIN unlock page ----------
if (location.pathname.endsWith('pin.html')) {
  auth.onAuthStateChanged(async (u) => {
    if (!u) { location.href='index.html'; return; }
    const currentUser = u;
    const pinInputs = Array.from(document.querySelectorAll('.pin-input'));
    const pinGroup = document.getElementById('pin-group');
    const pinError = document.getElementById('pin-error');
    const pinForgot = document.getElementById('pin-forgot');
    let attempts = 3;
    if (pinInputs && pinInputs.length) pinInputs[0].focus();

    pinInputs.forEach((input, idx) => {
      bindOnce(input, 'input', (e) => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && idx < pinInputs.length -1) pinInputs[idx+1].focus();
        if (pinInputs.every(i=>i.value)) submitPin();
      });
      bindOnce(input, 'keydown', (e) => { if (e.key === 'Backspace' && !input.value && idx>0) pinInputs[idx-1].focus(); });
    });

    async function submitPin() {
      const pin = pinInputs.map(i=>i.value).join('');
      try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        const data = doc.exists ? doc.data() : {};
        if (data.pin && data.pin === pin) {
          await db.collection('users').doc(currentUser.uid).update({ lastActivity: firebase.firestore.FieldValue.serverTimestamp() });
          location.href = 'home.html';
        } else {
          attempts--;
          pinError.style.display = 'block';
          pinError.textContent = attempts > 0 ? `Invalid PIN. ${attempts} attempts remaining.` : 'No attempts left. Please sign in again.';
          document.getElementById('pin-count').textContent = Math.max(0, attempts);
          if (attempts <= 0) pinInputs.forEach(i=>i.disabled=true);
          else { pinInputs.forEach(i=>i.value=''); pinInputs[0].focus(); pinGroup.classList.add('error'); setTimeout(()=>pinGroup.classList.remove('error'), 400); }
        }
      } catch (err) { console.error(err); showError('Error verifying PIN'); }
    }

    bindOnce(pinForgot, 'click', (e) => {
      e.preventDefault();
      document.getElementById('forgot-pin-modal').classList.remove('hidden');
    });

    bindOnce(document.getElementById('forgot-pin-cancel'), 'click', () => {
      document.getElementById('forgot-pin-modal').classList.add('hidden');
      document.getElementById('forgot-pin-password').value = '';
    });

    bindOnce(document.getElementById('forgot-pin-confirm'), 'click', async () => {
      const password = (document.getElementById('forgot-pin-password') || {}).value || '';
      if (!password) return showError('Enter your password');
      try {
        const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
        await currentUser.reauthenticateWithCredential(cred);
        const newPin = Math.floor(1000 + Math.random()*9000).toString();
        await db.collection('users').doc(currentUser.uid).update({ pin: newPin, pinEnabled: true });
        showDialog(`Your new PIN: ${newPin}`, { buttons: [{ text:'OK', class:'btn primary' }] });
        document.getElementById('forgot-pin-modal').classList.add('hidden');
      } catch (err) { showError('Password incorrect or verification failed'); }
    });
  });
}

// ---------- Utilities ----------
function showDialog(message, options = {}) {
  if (!document.getElementById('mj-dialog-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'mj-dialog-overlay';
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `<div class="dialog-card"><h3 class="dialog-title">My Journal</h3><div class="dialog-body" id="mj-dialog-body"></div><div class="dialog-actions" id="mj-dialog-actions"></div></div>`;
    document.body.appendChild(overlay);
  }
  const overlay = document.getElementById('mj-dialog-overlay');
  $('#mj-dialog-body', overlay).textContent = message || '';
  const actions = $('#mj-dialog-actions', overlay); actions.innerHTML = '';
  const buttons = options.buttons || [{ text:'OK', class:'btn primary', value:true }];
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.class || 'btn';
    btn.textContent = b.text || 'OK';
    btn.addEventListener('click', () => {
      overlay.style.display = 'none'; if (options.onClose) options.onClose(b.value);
    });
    actions.appendChild(btn);
  });
  overlay.style.display = 'flex';
}

function generateSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = '';
  for (let i=0;i<32;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function generateBackupCodes() {
  const codes = [];
  for (let i=0;i<10;i++) codes.push(Math.random().toString(36).substring(2,10).toUpperCase());
  return codes;
}

// Expose google popup sign-in globally (helpful for testing)
window.mj = window.mj || {}; window.mj.signInWithGooglePopup = signInWithGooglePopup;