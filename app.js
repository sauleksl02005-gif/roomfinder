const $ = selector => document.querySelector(selector);
const toast = message => {
  const element = $('#toast');
  element.textContent = message;
  element.style.display = 'block';
  setTimeout(() => { element.style.display = 'none'; }, 3200);
};

$('#year').textContent = new Date().getFullYear();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.protocol !== 'https:' && url.origin !== window.location.origin) return '';
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href;
  } catch { return ''; }
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}

async function loadRooms() {
  const params = new URLSearchParams();
  if ($('#query').value.trim()) params.set('q', $('#query').value.trim());
  if ($('#duration').value) params.set('duration', $('#duration').value);
  if ($('#maxPrice').value) params.set('maxPrice', $('#maxPrice').value);
  const box = $('#rooms');
  box.innerHTML = '<p>Chargement…</p>';
  try {
    const rooms = await readJson(await fetch(`/api/rooms?${params.toString()}`));
    $('#count').textContent = `${rooms.length} annonce(s)`;
    box.innerHTML = rooms.length ? rooms.map(room => {
      const photo = safePhotoUrl(room.photos?.[0]);
      return `<article class="room-card" data-id="${escapeHtml(room.id)}">
        <div class="room-photo">${photo ? `<img src="${escapeHtml(photo)}" alt="Photo de ${escapeHtml(room.title)}" loading="lazy">` : '⌂'}</div>
        <div class="room-info"><span class="pill">${escapeHtml(room.duration)}</span><h3>${escapeHtml(room.title)}</h3>
        <div class="room-meta">⌖ ${escapeHtml(room.neighborhood || '')}${room.neighborhood ? ', ' : ''}${escapeHtml(room.city)}</div>
        <div class="price">${Number(room.price).toLocaleString('fr-FR')} FCFA</div></div></article>`;
    }).join('') : '<p>Aucune chambre ne correspond à cette recherche.</p>';
    box.querySelectorAll('.room-card').forEach(card => card.addEventListener('click', () => showRoom(card.dataset.id)));
  } catch (error) {
    box.innerHTML = `<p>${escapeHtml(error.message || 'Impossible de charger les annonces.')}</p>`;
  }
}

$('#searchForm').addEventListener('submit', event => {
  event.preventDefault();
  loadRooms();
});

async function showRoom(id) {
  try {
    const room = await readJson(await fetch(`/api/rooms/${encodeURIComponent(id)}`));
    const photos = (room.photos || []).map(photo => safePhotoUrl(photo)).filter(Boolean);
    $('#modalContent').innerHTML = `<span class="pill">${escapeHtml(room.duration)}</span><h2>${escapeHtml(room.title)}</h2>
      <div class="detail-photos">${photos.length ? photos.map(photo => `<img src="${escapeHtml(photo)}" alt="Photo de la chambre" loading="lazy">`).join('') : '<p>Photos à venir</p>'}</div>
      <h3 class="price">${Number(room.price).toLocaleString('fr-FR')} FCFA</h3>
      <p>${escapeHtml(room.neighborhood)} · ${escapeHtml(room.city)}</p><p>${escapeHtml(room.description)}</p>
      <p><b>Équipements :</b> ${escapeHtml(room.amenities || 'Non précisés')}</p>
      <p>${escapeHtml(room.address || 'Adresse communiquée après contact')}</p>
      ${room.latitude && room.longitude ? `<p><a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${room.latitude},${room.longitude}`)}">Voir l’itinéraire sur Google Maps ↗</a></p>` : ''}
      <h3>Envoyer une demande</h3><form class="detail-form" id="contactForm">
        <input name="name" placeholder="Votre nom" maxlength="100" required>
        <input name="phone" placeholder="Votre numéro de téléphone" maxlength="30" required>
        <textarea name="message" placeholder="Votre message" rows="3" maxlength="3000" required></textarea>
        <button class="btn" type="submit">Envoyer le message</button></form>`;
    $('#modal').classList.remove('hidden');
    $('#contactForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      data.roomId = id;
      try {
        const result = await readJson(await fetch('/api/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        }));
        toast(result.message || 'Message envoyé.');
        form.reset();
      } catch (error) { toast(error.message || 'Envoi impossible.'); }
    });
  } catch (error) { toast(error.message || 'Impossible de charger cette chambre.'); }
}

$('#closeModal').addEventListener('click', () => $('#modal').classList.add('hidden'));
$('#modal').addEventListener('click', event => {
  if (event.target.id === 'modal') $('#modal').classList.add('hidden');
});

loadRooms();
