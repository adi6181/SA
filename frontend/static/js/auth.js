function setMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', isError);
    element.classList.toggle('success', !isError && Boolean(message));
}

function setupForgotPasswordModal() {
    const openButton = document.getElementById('openForgotPasswordModal');
    const closeButton = document.getElementById('closeForgotPasswordModal');
    const modal = document.getElementById('forgotPasswordModal');
    const form = document.getElementById('forgotPasswordForm');
    const emailInput = document.getElementById('forgotPasswordEmail');
    const message = document.getElementById('forgotPasswordMessage');

    if (!openButton || !closeButton || !modal || !form || !emailInput) return;

    const openModal = () => {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        setMessage(message, '');
        emailInput.focus();
    };

    const closeModal = () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        form.reset();
        setMessage(message, '');
    };

    openButton.addEventListener('click', openModal);
    closeButton.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim();
        if (!email) {
            setMessage(message, 'Email is required.', true);
            return;
        }

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(message, payload.error || 'Unable to process request.', true);
                return;
            }

            setMessage(message, payload.message || 'If the account exists, a reset link has been sent.');

            if (payload.reset_link) {
                const link = document.createElement('a');
                link.href = payload.reset_link;
                link.textContent = 'Open reset link';
                link.className = 'inline-reset-link';
                link.target = '_self';
                message.appendChild(document.createElement('br'));
                message.appendChild(link);
            }
        } catch (_error) {
            setMessage(message, 'Network error. Please try again.', true);
        }
    });
}

function setupSignupForm() {
    const form = document.getElementById('signupForm');
    const message = document.getElementById('signupMessage');
    if (!form || !message) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = document.getElementById('signupPassword')?.value || '';
        const rePassword = document.getElementById('signupRePassword')?.value || '';

        if (password !== rePassword) {
            setMessage(message, 'Password and Re-enter Password must match.', true);
            return;
        }

        const payload = {
            name: document.getElementById('signupName')?.value.trim(),
            email: document.getElementById('signupEmail')?.value.trim(),
            password,
            address_line1: document.getElementById('signupAddress1')?.value.trim(),
            address_line2: document.getElementById('signupAddress2')?.value.trim(),
            city: document.getElementById('signupCity')?.value.trim(),
            state: document.getElementById('signupState')?.value.trim().toUpperCase(),
            zip_code: document.getElementById('signupZip')?.value.trim(),
            country_code: document.getElementById('signupCountryCode')?.value || 'US'
        };

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(message, result.error || 'Unable to create account.', true);
                return;
            }

            setMessage(message, result.message || 'Account created. Redirecting to login...');
            form.reset();
            const countryCode = document.getElementById('signupCountryCode');
            if (countryCode) countryCode.value = 'US';
            setTimeout(() => {
                window.location.href = '/login';
            }, 1200);
        } catch (_error) {
            setMessage(message, 'Network error. Please try again.', true);
        }
    });
}

function setupLoginForm() {
    const form = document.getElementById('loginForm');
    const message = document.getElementById('loginMessage');
    if (!form || !message) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('loginEmail')?.value.trim();
        const password = document.getElementById('loginPassword')?.value || '';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(message, result.error || 'Login failed.', true);
                return;
            }

            setMessage(message, result.message || 'Login successful.');
        } catch (_error) {
            setMessage(message, 'Network error. Please try again.', true);
        }
    });
}

function setupResetPasswordForm() {
    const form = document.getElementById('resetPasswordForm');
    const message = document.getElementById('resetPasswordMessage');
    const tokenInput = document.getElementById('resetToken');
    const newPassword = document.getElementById('newPassword');
    const verifyPassword = document.getElementById('verifyPassword');

    if (!form || !message || !tokenInput || !newPassword || !verifyPassword) return;

    const tokenFromQuery = new URLSearchParams(window.location.search).get('token');
    if (!tokenInput.value && tokenFromQuery) {
        tokenInput.value = tokenFromQuery;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const token = tokenInput.value.trim();
        const nextPassword = newPassword.value;
        const confirmPassword = verifyPassword.value;

        if (!token) {
            setMessage(message, 'Invalid reset link. Please request a new password reset email.', true);
            return;
        }
        if (nextPassword.length < 8) {
            setMessage(message, 'New password must be at least 8 characters.', true);
            return;
        }
        if (nextPassword !== confirmPassword) {
            setMessage(message, 'Passwords do not match.', true);
            return;
        }

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    new_password: nextPassword,
                    verify_password: confirmPassword
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(message, payload.error || 'Unable to reset password.', true);
                return;
            }

            setMessage(message, payload.message || 'Password reset successful.');
            setTimeout(() => {
                window.location.href = '/login';
            }, 1400);
        } catch (_error) {
            setMessage(message, 'Network error. Please try again.', true);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupSignupForm();
    setupLoginForm();
    setupForgotPasswordModal();
    setupResetPasswordForm();
});
