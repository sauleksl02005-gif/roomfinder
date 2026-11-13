const $ = s => document.querySelector(s);
const toast = msg => { const el = $('#toast'); el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 3500); };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('#year').textContent = new Date().getFullYear();
async function loadRooms() {
  const p = new URLSearchParams(); if ($('#query').value.trim()) p.set('q', $('#query').value.trim()); if ($('#duration').value) p.set('duration', $('#duration').value); if ($('#maxPrice').value) p.set('maxPrice', $('#maxPrice').value);
  const box = $('#rooms'); box.innerHTML = '<p>Chargement…</p>';
  try {
    const r = await fetch('/api/rooms?' + p); const rooms = await r.json(); if (!r.ok) throw new Error(rooms.error);
    $('#count').textContent = `${rooms.length} annonce(s)`;
    box.innerHTML = rooms.length ? rooms.map(x => `<article class="room-card" data-id="${esc(x.id)}"><div class="room-photo">${x.photos?.[0] ? `<img src="${esc(x.photos[0])}" alt="Photo de chambre">` : '⌂'}</div><div class="room-info"><span class="pill">${esc(x.duration)}</span><h3>${esc(x.title)}</h3><div class="room-meta">⌖ ${esc(x.neighborhood)}${x.neighborhood ? ', ' : ''}${esc(x.city)}</div><div class="price">${Number(x.price).toLocaleString('fr-FR')} FCFA</div></div></article>`).join('') : '<p>Aucune chambre ne correspond à cette recherche.</p>';
    box.querySelectorAll('.room-card').forEach(c => c.addEventListener('click', () => showRoom(c.dataset.id)));
  } catch (e) { box.innerHTML = `<p>Impossible de charger les annonces : ${esc(e.message)}</p>`; }
}
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); loadRooms(); });
async function showRoom(id) {
  try {
    const response = await fetch('/api/rooms/' + encodeURIComponent(id)); const r = await response.json(); if (!response.ok) throw new Error(r.error);
    $('#modalContent').innerHTML = `<span class="pill">${esc(r.duration)}</span><h2>${esc(r.title)}</h2><div class="detail-photos">${(r.photos || []).map(p => `<img src="${esc(p)}" alt="Photo de chambre">`).join('') || '<p>Photos à venir</p>'}</div><h3 class="price">${Number(r.price).toLocaleString('fr-FR')} FCFA</h3><p>${esc(r.neighborhood)} · ${esc(r.city)}</p><p>${esc(r.description)}</p><p><b>Équipements :</b> ${esc(r.amenities || 'Non précisés')}</p><p>${esc(r.address || 'Adresse communiquée après contact')}</p>${r.latitude && r.longitude ? `<p><a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.latitude + ',' + r.longitude)}">Voir l’itinéraire sur Google Maps ↗</a></p>` : ''}<h3>Envoyer une demande</h3><form class="detail-form" id="contactForm"><input name="name" placeholder="Votre nom" required><input name="phone" placeholder="Votre téléphone" required><textarea name="message" placeholder="Votre message" rows="3" required></textarea><button class="btn">Envoyer le message</button></form>`;
    $('#modal').classList.remove('hidden'); $('#contactForm').addEventListener('submit', async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); data.roomId = id; const out = await fetch('/api/contact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const result = await out.json(); toast(result.message || result.error); if (out.ok) e.target.reset(); });
  } catch (e) { toast(e.message); }
}
$('#closeModal').onclick = () => $('#modal').classList.add('hidden'); $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
loadRooms();
