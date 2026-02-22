function setSupportMessage(target, message, isError = false) {
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('error', isError);
    target.classList.toggle('success', !isError && Boolean(message));
}

const defaultChatSuggestions = [
    'How long does shipping take?',
    'How can I track my order?',
    'How do returns/refunds work?',
    'I forgot my password. What should I do?',
    'Why is my review not visible?'
];

let hasPlayedGreetingSequence = false;
let typingIndicatorNode = null;

async function loadFaqs() {
    const faqList = document.getElementById('faqListCompact');
    if (!faqList) return;
    try {
        const response = await fetch('/api/support/faqs');
        const faqs = await response.json();
        if (!response.ok) throw new Error('Failed to load FAQs');
        faqList.innerHTML = '';
        (faqs || []).slice(0, 5).forEach((faq) => {
            const item = document.createElement('li');
            item.className = 'faq-item';
            item.innerHTML = `<strong>${faq.question}</strong><span>${faq.answer}</span>`;
            faqList.appendChild(item);
        });
    } catch (_error) {
        faqList.innerHTML = '<li class="faq-item"><strong>FAQ unavailable</strong><span>Please try again later.</span></li>';
    }
}

function setupContactForm() {
    const form = document.getElementById('contactSupportForm');
    const message = document.getElementById('supportFormMessage');
    if (!form || !message) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            name: document.getElementById('supportName')?.value.trim(),
            email: document.getElementById('supportEmail')?.value.trim(),
            subject: document.getElementById('supportSubject')?.value.trim(),
            message: document.getElementById('supportMessage')?.value.trim(),
            channel: 'contact_form'
        };

        try {
            const response = await fetch('/api/support/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSupportMessage(message, result.error || 'Failed to create ticket.', true);
                return;
            }
            const ticketNumber = result.ticket?.ticket_number || '';
            setSupportMessage(message, `Ticket created: ${ticketNumber}. Save this number for tracking.`);
            form.reset();
        } catch (_error) {
            setSupportMessage(message, 'Network error. Please try again.', true);
        }
    });
}

function setupTicketLookup() {
    const form = document.getElementById('ticketLookupForm');
    const message = document.getElementById('ticketLookupMessage');
    if (!form || !message) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const ticketNumber = document.getElementById('lookupTicketNumber')?.value.trim();
        const email = document.getElementById('lookupEmail')?.value.trim();
        if (!ticketNumber || !email) {
            setSupportMessage(message, 'Ticket number and email are required.', true);
            return;
        }

        try {
            const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticketNumber)}?email=${encodeURIComponent(email)}`);
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSupportMessage(message, result.error || 'Ticket lookup failed.', true);
                return;
            }
            setSupportMessage(message, `Status: ${result.status}. Subject: ${result.subject}`);
        } catch (_error) {
            setSupportMessage(message, 'Network error. Please try again.', true);
        }
    });
}

function appendChatMessage(text, sender = 'bot') {
    const messages = document.getElementById('supportChatMessages');
    if (!messages) return;
    const node = document.createElement('p');
    node.className = sender === 'user' ? 'support-chat-user' : 'support-chat-bot';
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
    if (typingIndicatorNode?.parentNode) {
        typingIndicatorNode.parentNode.removeChild(typingIndicatorNode);
    }
    typingIndicatorNode = null;
}

function showTypingIndicator() {
    const messages = document.getElementById('supportChatMessages');
    if (!messages) return;
    removeTypingIndicator();

    const bubble = document.createElement('div');
    bubble.className = 'support-chat-typing';
    bubble.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;
    typingIndicatorNode = bubble;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
}

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function renderChatSuggestions(items) {
    const wrap = document.getElementById('supportChatSuggestions');
    if (!wrap) return;
    const list = (items && items.length ? items : defaultChatSuggestions).slice(0, 6);
    wrap.innerHTML = '';

    list.forEach((item, index) => {
        const question = typeof item === 'string' ? item : item.question;
        if (!question) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'support-suggestion-chip';
        chip.style.setProperty('--suggestion-delay', `${index * 70}ms`);
        chip.dataset.question = question;
        chip.textContent = question;
        wrap.appendChild(chip);
    });
}

async function sendAssistantMessage(text) {
    appendChatMessage(text, 'user');
    showTypingIndicator();
    try {
        const response = await fetch('/api/support/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const result = await response.json().catch(() => ({}));
        await wait(420);
        removeTypingIndicator();
        if (!response.ok) {
            appendChatMessage(result.error || 'Assistant unavailable right now.');
            return;
        }
        appendChatMessage(result.answer || 'How else can I help?');
        renderChatSuggestions(result.suggestions || []);
    } catch (_error) {
        removeTypingIndicator();
        appendChatMessage('Network issue. Please try again.');
    }
}

async function playGreetingSequence() {
    const messages = document.getElementById('supportChatMessages');
    if (!messages) return;
    messages.innerHTML = '';

    const sequence = [
        'Hi, I am your ShopHub support assistant.',
        'I can help with shipping, tracking, returns, account access, and reviews.',
        'Pick a prompt below or ask your question.'
    ];

    for (const line of sequence) {
        showTypingIndicator();
        await wait(380);
        removeTypingIndicator();
        appendChatMessage(line, 'bot');
        await wait(120);
    }

    renderChatSuggestions(defaultChatSuggestions);
}

function setupSupportChat() {
    const toggle = document.getElementById('supportChatToggle');
    const panel = document.getElementById('supportChatPanel');
    const close = document.getElementById('supportChatClose');
    const form = document.getElementById('supportChatForm');
    const input = document.getElementById('supportChatInput');
    const suggestionsWrap = document.getElementById('supportChatSuggestions');
    if (!toggle || !panel || !close || !form || !input) return;

    toggle.addEventListener('click', () => {
        panel.classList.toggle('open');
        panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
        if (panel.classList.contains('open')) {
            if (!hasPlayedGreetingSequence) {
                hasPlayedGreetingSequence = true;
                playGreetingSequence();
            } else {
                renderChatSuggestions(defaultChatSuggestions);
            }
            input.focus();
        } else {
            removeTypingIndicator();
        }
    });

    close.addEventListener('click', () => {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        removeTypingIndicator();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        sendAssistantMessage(text);
    });

    suggestionsWrap?.addEventListener('click', (event) => {
        const chip = event.target.closest('.support-suggestion-chip');
        if (!chip) return;
        const question = chip.dataset.question || '';
        if (!question) return;
        sendAssistantMessage(question);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadFaqs();
    setupContactForm();
    setupTicketLookup();
    setupSupportChat();
});
