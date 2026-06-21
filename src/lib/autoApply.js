/**
 * Assisted auto-apply.
 *
 * We deliberately do NOT headlessly submit external forms (fragile + risky).
 * Instead we keep a reusable applicant profile and, on demand, build a
 * ready-to-paste application, copy it to the clipboard, open the real
 * registration page in a new tab, and mark the event "applied" on the backend.
 *
 * If the profile is empty the first time, we pop a modal to collect it.
 */
import { el, clear } from './dom.js';
import { toast } from './notify.js';

const FIELDS = [
  { key: 'full_name', label: 'Full name', placeholder: 'Ada Lovelace', required: true },
  { key: 'email', label: 'Email', placeholder: 'ada@example.com', type: 'email', required: true },
  { key: 'phone', label: 'Phone', placeholder: '+1 555 010 1234' },
  { key: 'dob', label: 'Date of birth', placeholder: 'YYYY-MM-DD', type: 'date' },
  { key: 'school', label: 'School / University', placeholder: 'UC Berkeley' },
  { key: 'major', label: 'Major / Field', placeholder: 'Computer Science' },
  { key: 'grad_year', label: 'Graduation year', placeholder: '2027' },
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/…' },
  { key: 'portfolio', label: 'Portfolio / Website', placeholder: 'https://…' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/…' },
  { key: 'bio', label: 'Short bio / why interested', placeholder: 'One or two sentences…', textarea: true },
];

const REQUIRED = FIELDS.filter((f) => f.required).map((f) => f.key);

function hasMinimumProfile(profile) {
  return REQUIRED.every((k) => String((profile && profile[k]) || '').trim());
}

function buildApplicationText(profile, cand) {
  const lines = [
    `Application — ${cand.title || 'Event'}${cand.source ? ` (${cand.source})` : ''}`,
    cand.url ? `Registration: ${cand.url}` : null,
    '',
    `Full name: ${profile.full_name || ''}`,
    `Email: ${profile.email || ''}`,
    profile.phone ? `Phone: ${profile.phone}` : null,
    profile.dob ? `Date of birth: ${profile.dob}` : null,
    profile.school ? `School: ${profile.school}` : null,
    profile.major ? `Major: ${profile.major}` : null,
    profile.grad_year ? `Graduation year: ${profile.grad_year}` : null,
    profile.github ? `GitHub: ${profile.github}` : null,
    profile.portfolio ? `Portfolio: ${profile.portfolio}` : null,
    profile.linkedin ? `LinkedIn: ${profile.linkedin}` : null,
    profile.bio ? `\nAbout me: ${profile.bio}` : null,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = el('textarea', { style: 'position:fixed;opacity:0;top:-1000px;' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

/** Modal to view/edit the applicant profile. Resolves to the saved profile (or null). */
export function openProfileModal(api, { initial } = {}) {
  return new Promise((resolve) => {
    const inputs = {};
    let current = initial || null;

    const formGrid = el('div', { class: 'profile-grid' });
    function renderFields(profile) {
      clear(formGrid);
      for (const f of FIELDS) {
        const value = (profile && profile[f.key]) || '';
        const input = f.textarea
          ? el('textarea', { class: 'profile-input', rows: '3', placeholder: f.placeholder || '' })
          : el('input', { class: 'profile-input', type: f.type || 'text', placeholder: f.placeholder || '' });
        input.value = value;
        inputs[f.key] = input;
        formGrid.append(
          el('label', { class: `profile-field${f.textarea ? ' profile-field--wide' : ''}` }, [
            el('span', { class: 'profile-label', text: f.label + (f.required ? ' *' : '') }),
            input,
          ])
        );
      }
    }
    renderFields(current);

    const status = el('p', { class: 'profile-status', hidden: true });
    const saveBtn = el('button', { class: 'primary-btn', type: 'button', text: 'Save profile' });
    const cancelBtn = el('button', { class: 'ghost-btn', type: 'button', text: 'Cancel' });

    const overlay = el('div', { class: 'modal-overlay' }, [
      el('div', { class: 'modal' }, [
        el('div', { class: 'modal-head' }, [
          el('h2', { class: 'modal-title', text: 'Your applicant profile' }),
          el('p', {
            class: 'modal-sub',
            text: 'Saved once, reused for every auto-apply. Fields marked * are required.',
          }),
        ]),
        formGrid,
        status,
        el('div', { class: 'modal-actions' }, [cancelBtn, saveBtn]),
      ]),
    ]);

    function close(result) {
      overlay.classList.add('modal-overlay--out');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    saveBtn.addEventListener('click', async () => {
      const next = {};
      for (const f of FIELDS) next[f.key] = String(inputs[f.key].value || '').trim();
      if (!hasMinimumProfile(next)) {
        status.textContent = 'Name and email are required.';
        status.hidden = false;
        return;
      }
      saveBtn.disabled = true;
      status.hidden = false;
      status.textContent = 'Saving…';
      try {
        const res = await api.saveProfile(next);
        current = (res && res.profile) || next;
        close(current);
      } catch (err) {
        console.error('[profile] save failed', err);
        status.textContent = 'Could not save. Is the backend running?';
        saveBtn.disabled = false;
      }
    });

    // Load latest from backend if no initial provided.
    if (!initial && api.getProfile) {
      api
        .getProfile()
        .then((p) => {
          current = p || null;
          renderFields(current);
        })
        .catch(() => {});
    }

    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--in'));
  });
}

/** Main entry: prefill an application for `cand`, copy it, open the URL, mark applied. */
export async function autoApply(cand, api, { onApplied } = {}) {
  let profile = {};
  try {
    profile = (await api.getProfile()) || {};
  } catch {
    profile = {};
  }

  if (!hasMinimumProfile(profile)) {
    toast('Set up your applicant profile to auto-apply.', { tone: 'info' });
    const saved = await openProfileModal(api, { initial: profile });
    if (!saved || !hasMinimumProfile(saved)) return false;
    profile = saved;
  }

  const text = buildApplicationText(profile, cand);
  const copied = await copyToClipboard(text);

  if (cand.url) window.open(cand.url, '_blank', 'noopener');

  try {
    await api.applyCandidate(cand.id, cand.watch_id);
  } catch (err) {
    console.warn('[autoApply] mark-applied failed', err);
  }

  toast(
    copied
      ? `Application copied${cand.url ? ' — registration opened' : ''}. Paste your details into the form.`
      : `Registration opened. Your details are ready in the profile.`,
    { tone: 'success', timeout: 6000 }
  );

  if (onApplied) onApplied();
  return true;
}
