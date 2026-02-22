const reviewsListEl = document.getElementById('reviewsList');
const reviewForm = document.getElementById('reviewForm');
const reviewMessage = document.getElementById('reviewFormMessage');
const productId = document.getElementById('reviewProductId')?.value;

function reviewVoterToken() {
    const existing = localStorage.getItem('reviewVoterToken');
    if (existing) return existing;
    const created = `voter_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem('reviewVoterToken', created);
    return created;
}

function setReviewMessage(message, isError = false) {
    if (!reviewMessage) return;
    reviewMessage.textContent = message;
    reviewMessage.classList.toggle('error', isError);
    reviewMessage.classList.toggle('success', !isError && Boolean(message));
}

function stars(value) {
    const rating = Math.max(1, Math.min(5, Number(value) || 0));
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function renderReviews(reviews) {
    if (!reviewsListEl) return;
    if (!reviews || reviews.length === 0) {
        reviewsListEl.innerHTML = '<p class="empty-products">No approved reviews yet. Be the first to review.</p>';
        return;
    }

    reviewsListEl.innerHTML = reviews.map((review) => `
        <article class="review-card" data-review-id="${review.id}">
            <div class="review-head">
                <h4>${review.title || 'Customer Review'}</h4>
                <span class="review-stars">${stars(review.rating)}</span>
            </div>
            <p class="review-meta">
                By ${review.reviewer_name}
                ${review.verified_purchase ? '<span class="verified-pill">Verified Purchase</span>' : ''}
            </p>
            <p>${review.body}</p>
            ${review.photo_url ? `<img class="review-photo" src="${review.photo_url}" alt="Review photo">` : ''}
            <div class="review-actions">
                <button type="button" class="quick-chip helpful-btn" data-helpful-id="${review.id}">
                    Helpful (${review.helpful_count || 0})
                </button>
            </div>
        </article>
    `).join('');
}

async function loadReviews() {
    if (!productId || !reviewsListEl) return;
    try {
        const response = await fetch(`/api/products/${productId}/reviews`);
        const reviews = await response.json();
        renderReviews(reviews || []);
    } catch (_error) {
        reviewsListEl.innerHTML = '<p class="empty-products">Failed to load reviews.</p>';
    }
}

async function submitReview(event) {
    event.preventDefault();
    if (!productId) return;

    const formData = new FormData();
    formData.append('reviewer_name', document.getElementById('reviewerName')?.value.trim() || '');
    formData.append('reviewer_email', document.getElementById('reviewerEmail')?.value.trim() || '');
    formData.append('rating', document.getElementById('reviewRating')?.value || '');
    formData.append('title', document.getElementById('reviewTitle')?.value.trim() || '');
    formData.append('body', document.getElementById('reviewBody')?.value.trim() || '');
    formData.append('order_number', document.getElementById('reviewOrderNumber')?.value.trim() || '');
    const photo = document.getElementById('reviewPhoto')?.files?.[0];
    if (photo) formData.append('photo', photo);

    try {
        const response = await fetch(`/api/products/${productId}/reviews`, {
            method: 'POST',
            body: formData
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            setReviewMessage(payload.error || 'Unable to submit review.', true);
            return;
        }

        setReviewMessage(payload.message || 'Review submitted.');
        reviewForm?.reset();
        loadReviews();
    } catch (_error) {
        setReviewMessage('Network error. Please try again.', true);
    }
}

async function voteHelpful(event) {
    const button = event.target.closest('[data-helpful-id]');
    if (!button) return;

    const reviewId = button.dataset.helpfulId;
    try {
        const response = await fetch(`/api/products/reviews/${reviewId}/helpful`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Voter-Token': reviewVoterToken()
            },
            body: JSON.stringify({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;

        button.textContent = `Helpful (${payload.helpful_count || 0})`;
        if (payload.already_voted) {
            button.disabled = true;
        }
    } catch (_error) {
        // Ignore vote errors.
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadReviews();
    reviewForm?.addEventListener('submit', submitReview);
    reviewsListEl?.addEventListener('click', voteHelpful);
});
