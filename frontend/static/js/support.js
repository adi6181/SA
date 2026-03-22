/* ══════════════════════════════════════════════════
   DealDrop Support JS
   ══════════════════════════════════════════════════ */

function setSupportMessage(target, message, isError = false) {
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('error',   isError);
    target.classList.toggle('success', !isError && Boolean(message));
}

/* ── FAQ loader (support page) ── */
async function loadFaqs() {
    const faqList = document.getElementById('faqListCompact');
    if (!faqList) return;
    try {
        const r = await fetch('/api/support/faqs');
        const faqs = await r.json();
        if (!r.ok) throw new Error();
        faqList.innerHTML = '';
        (faqs || []).slice(0, 5).forEach(faq => {
            const li = document.createElement('li');
            li.className = 'faq-item';
            li.innerHTML = `<strong>${faq.question}</strong><span>${faq.answer}</span>`;
            faqList.appendChild(li);
        });
    } catch {
        if (faqList) faqList.innerHTML = '<li class="faq-item"><strong>FAQ unavailable</strong><span>Please try again later.</span></li>';
    }
}

/* ── Contact form (support page) ── */
function setupContactForm() {
    const form = document.getElementById('contactSupportForm');
    const msg  = document.getElementById('supportFormMessage');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {
            name:     document.getElementById('supportName')?.value.trim(),
            email:    document.getElementById('supportEmail')?.value.trim(),
            subject:  document.getElementById('supportSubject')?.value.trim(),
            category: document.getElementById('supportCategory')?.value,
            message:  document.getElementById('supportMessage')?.value.trim(),
            channel:  'contact_form'
        };
        try {
            const r = await fetch('/api/support/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await r.json().catch(() => ({}));
            if (!r.ok) { setSupportMessage(msg, result.error || 'Failed to create ticket.', true); return; }
            const num = result.ticket?.ticket_number || '';
            setSupportMessage(msg, `✅ Ticket created: ${num}. Save this number for tracking.`);
            form.reset();
        } catch { setSupportMessage(msg, 'Network error. Please try again.', true); }
    });
}

/* ── Ticket lookup (support page) ── */
function setupTicketLookup() {
    const form = document.getElementById('ticketLookupForm');
    const msg  = document.getElementById('ticketLookupMessage');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const num   = document.getElementById('lookupTicketNumber')?.value.trim();
        const email = document.getElementById('lookupEmail')?.value.trim();
        if (!num || !email) { setSupportMessage(msg, 'Both fields are required.', true); return; }
        try {
            const r = await fetch(`/api/support/tickets/${encodeURIComponent(num)}?email=${encodeURIComponent(email)}`);
            const result = await r.json().catch(() => ({}));
            if (!r.ok) { setSupportMessage(msg, result.error || 'Ticket not found.', true); return; }
            setSupportMessage(msg, `Status: ${result.status} — ${result.subject}`);
        } catch { setSupportMessage(msg, 'Network error. Please try again.', true); }
    });
}

/* ══════════════════════════════════════════════════
   FLOATING CHAT BOT
   ══════════════════════════════════════════════════ */

const defaultChatSuggestions = [
    'How long does shipping take?',
    'How can I track my order?',
    'How do returns/refunds work?',
    'I forgot my password.',
    'Why is my review not visible?'
];

let chatMode          = 'idle';   // idle | faq | ticket | track
let ticketStep        = 0;
let ticketData        = {};
let typingIndicator   = null;
let greetingPlayed    = false;

const TICKET_STEPS = [
    { key: 'name',    label: 'Your name',            type: 'text',  placeholder: 'e.g. Jane Smith' },
    { key: 'email',   label: 'Your email',           type: 'email', placeholder: 'e.g. jane@email.com' },
    { key: 'subject', label: 'Subject / Issue',      type: 'text',  placeholder: 'e.g. Order not delivered' },
    { key: 'message', label: 'Describe your issue',  type: 'textarea', placeholder: 'Give as much detail as possible…' }
];

function $(id) { return document.getElementById(id); }

/* ── Chat message helpers ── */
function appendMsg(text, role = 'bot') {
    const wrap = $('supportChatMessages');
    if (!wrap) return;
    const p = document.createElement('p');
    p.className = role === 'user' ? 'support-chat-user' : 'support-chat-bot';
    p.textContent = text;
    wrap.appendChild(p);
    wrap.scrollTop = wrap.scrollHeight;
}

function appendHTML(html, role = 'bot') {
    const wrap = $('supportChatMessages');
    if (!wrap) return;
    const p = document.createElement('div');
    p.className = role === 'user' ? 'support-chat-user' : 'support-chat-bot';
    p.innerHTML = html;
    wrap.appendChild(p);
    wrap.scrollTop = wrap.scrollHeight;
}

function removeTyping() {
    if (typingIndicator?.parentNode) typingIndicator.parentNode.removeChild(typingIndicator);
    typingIndicator = null;
}

function showTyping() {
    const wrap = $('supportChatMessages');
    if (!wrap) return;
    removeTyping();
    const d = document.createElement('div');
    d.className = 'support-chat-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    typingIndicator = d;
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function showActions(visible) {
    const el = $('supportChatActions');
    if (el) el.style.display = visible ? 'flex' : 'none';
}

function showChatForm(visible) {
    const el = $('supportChatForm');
    if (el) el.style.display = visible ? 'flex' : 'none';
}

function showWizard(visible) {
    const el = $('supportTicketWizard');
    if (el) el.style.display = visible ? 'block' : 'none';
}

function renderSuggestions(items) {
    const wrap = $('supportChatSuggestions');
    if (!wrap) return;
    const list = (items?.length ? items : defaultChatSuggestions).slice(0, 5);
    wrap.innerHTML = '';
    list.forEach((item, i) => {
        const q = typeof item === 'string' ? item : item.question;
        if (!q) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'support-suggestion-chip';
        btn.style.setProperty('--suggestion-delay', `${i * 60}ms`);
        btn.dataset.question = q;
        btn.textContent = q;
        wrap.appendChild(btn);
    });
}

/* ── Greeting sequence ── */
async function playGreeting() {
    const wrap = $('supportChatMessages');
    if (wrap) wrap.innerHTML = '';
    showActions(false);
    showChatForm(false);
    showWizard(false);
    renderSuggestions([]);

    const lines = [
        'Hi there! 👋 I\'m the DealDrop support assistant.',
        'I can help you create a ticket, track an existing one, or answer your questions instantly.'
    ];
    for (const line of lines) {
        showTyping();
        await wait(400);
        removeTyping();
        appendMsg(line, 'bot');
        await wait(100);
    }
    showActions(true);
}

/* ══════════════════════════════════
   TICKET WIZARD
══════════════════════════════════ */
function renderWizardStep() {
    const step     = TICKET_STEPS[ticketStep];
    const stepEl   = $('stwStep');
    const fieldsEl = $('stwFields');
    const backBtn  = $('stwBack');
    const nextBtn  = $('stwNext');
    if (!fieldsEl || !step) return;

    if (stepEl) stepEl.textContent = `Step ${ticketStep + 1} of ${TICKET_STEPS.length}`;
    if (backBtn) backBtn.style.display = ticketStep > 0 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.textContent = ticketStep === TICKET_STEPS.length - 1 ? 'Submit Ticket ✓' : 'Next →';

    const val = ticketData[step.key] || '';
    if (step.type === 'textarea') {
        fieldsEl.innerHTML = `
            <label class="stw-label">${step.label}</label>
            <textarea class="stw-input" id="stwInput" placeholder="${step.placeholder}" rows="3">${val}</textarea>`;
    } else {
        fieldsEl.innerHTML = `
            <label class="stw-label">${step.label}</label>
            <input class="stw-input" id="stwInput" type="${step.type}" placeholder="${step.placeholder}" value="${val}">`;
    }
    const inp = $('stwInput');
    if (inp) { inp.focus(); }
}

async function advanceWizard() {
    const inp = $('stwInput');
    const val = inp?.value.trim();
    if (!val) { inp?.classList.add('stw-error'); inp?.focus(); return; }
    inp?.classList.remove('stw-error');
    ticketData[TICKET_STEPS[ticketStep].key] = val;

    if (ticketStep < TICKET_STEPS.length - 1) {
        ticketStep++;
        renderWizardStep();
        return;
    }

    // Submit
    showWizard(false);
    appendMsg(`Submitting your ticket…`, 'bot');
    showTyping();
    try {
        const r = await fetch('/api/support/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...ticketData, channel: 'chatbot' })
        });
        const result = await r.json().catch(() => ({}));
        await wait(600);
        removeTyping();
        if (!r.ok) {
            appendMsg(result.error || 'Could not create ticket. Please try the support page.', 'bot');
        } else {
            const num = result.ticket?.ticket_number || '';
            appendHTML(`✅ <strong>Ticket created!</strong> Your number is <strong>${num}</strong>. Save it to track your issue. We'll reply within 24 hours.`, 'bot');
        }
    } catch {
        removeTyping();
        appendMsg('Network error. Please visit /support to submit your ticket.', 'bot');
    }
    await wait(400);
    appendMsg('Is there anything else I can help you with?', 'bot');
    showActions(true);
    ticketData = {}; ticketStep = 0;
}

/* ── Track ticket via chat ── */
async function startTrackFlow() {
    chatMode = 'track';
    showActions(false);
    showChatForm(false);
    showWizard(false);
    renderSuggestions([]);

    const wrap = $('supportChatMessages');
    if (wrap) wrap.innerHTML = '';

    appendMsg('Sure! Please type your ticket number (e.g. TKT-12345) and email separated by a comma.', 'bot');
    appendMsg('Example: TKT-12345, jane@email.com', 'bot');
    showChatForm(true);
    $('supportChatInput')?.focus();
}

async function handleTrackInput(text) {
    const parts = text.split(',').map(s => s.trim());
    if (parts.length < 2) {
        appendMsg('Please enter both ticket number and email, separated by a comma.', 'bot');
        return;
    }
    const [num, email] = parts;
    showTyping();
    try {
        const r = await fetch(`/api/support/tickets/${encodeURIComponent(num)}?email=${encodeURIComponent(email)}`);
        const result = await r.json().catch(() => ({}));
        await wait(400);
        removeTyping();
        if (!r.ok) {
            appendMsg(result.error || 'Ticket not found. Double-check the number and email.', 'bot');
        } else {
            appendHTML(`Found it! <strong>${num}</strong> — Status: <strong>${result.status}</strong><br>Subject: ${result.subject}`, 'bot');
        }
    } catch {
        removeTyping();
        appendMsg('Network error. Please try again.', 'bot');
    }
    await wait(300);
    appendMsg('Anything else?', 'bot');
    chatMode = 'faq';
    showActions(true);
    showChatForm(false);
}

/* ── FAQ chat ── */
async function sendFAQ(text) {
    appendMsg(text, 'user');
    showTyping();
    try {
        const r = await fetch('/api/support/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const result = await r.json().catch(() => ({}));
        await wait(420);
        removeTyping();
        appendMsg(result.answer || 'How else can I help?', 'bot');
        renderSuggestions(result.suggestions || []);
    } catch {
        removeTyping();
        appendMsg('Something went wrong. Please try again.', 'bot');
    }
}

/* ── Action button dispatcher ── */
function handleAction(action) {
    showActions(false);
    renderSuggestions([]);

    if (action === 'ticket') {
        chatMode = 'ticket';
        ticketStep = 0;
        ticketData = {};
        const wrap = $('supportChatMessages');
        if (wrap) wrap.innerHTML = '';
        appendMsg("Let's create a ticket. I'll ask you a few quick questions.", 'bot');
        showWizard(true);
        renderWizardStep();

    } else if (action === 'track') {
        startTrackFlow();

    } else if (action === 'faq') {
        chatMode = 'faq';
        const wrap = $('supportChatMessages');
        if (wrap) wrap.innerHTML = '';
        appendMsg('Sure! Pick a common question or type your own.', 'bot');
        renderSuggestions(defaultChatSuggestions);
        showChatForm(true);
        $('supportChatInput')?.focus();
    }
}

/* ── Main chat setup ── */
function setupSupportChat() {
    const toggle       = $('supportChatToggle');
    const panel        = $('supportChatPanel');
    const closeBtn     = $('supportChatClose');
    const form         = $('supportChatForm');
    const input        = $('supportChatInput');
    const suggestWrap  = $('supportChatSuggestions');
    const actionsWrap  = $('supportChatActions');
    const nextBtn      = $('stwNext');
    const backBtn      = $('stwBack');

    if (!toggle || !panel) return;

    toggle.addEventListener('click', () => {
        const isOpen = panel.classList.toggle('open');
        panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if (isOpen) {
            if (!greetingPlayed) { greetingPlayed = true; playGreeting(); }
            else { showActions(chatMode === 'idle' || chatMode === ''); }
        } else {
            removeTyping();
        }
    });

    closeBtn?.addEventListener('click', () => {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        removeTyping();
    });

    /* Action buttons */
    actionsWrap?.addEventListener('click', e => {
        const btn = e.target.closest('.sca-btn');
        if (btn) handleAction(btn.dataset.action);
    });

    /* Wizard next/back */
    nextBtn?.addEventListener('click', advanceWizard);
    backBtn?.addEventListener('click', () => {
        if (ticketStep > 0) { ticketStep--; renderWizardStep(); }
    });

    /* Enter in wizard input */
    $('stwFields')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); advanceWizard(); }
    });

    /* FAQ form submit */
    form?.addEventListener('submit', async e => {
        e.preventDefault();
        const text = input?.value.trim();
        if (!text) return;
        input.value = '';
        if (chatMode === 'track') { appendMsg(text, 'user'); handleTrackInput(text); }
        else                      { sendFAQ(text); }
    });

    /* Suggestion chips */
    suggestWrap?.addEventListener('click', e => {
        const chip = e.target.closest('.support-suggestion-chip');
        if (chip?.dataset.question) sendFAQ(chip.dataset.question);
    });

    /* openChatBotBtn on support page */
    document.getElementById('openChatBotBtn')?.addEventListener('click', () => {
        if (!panel.classList.contains('open')) toggle.click();
        panel.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    loadFaqs();
    setupContactForm();
    setupTicketLookup();
    setupSupportChat();
});
